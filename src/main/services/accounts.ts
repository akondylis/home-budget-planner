import { z } from 'zod'
import { prisma } from '../db/prisma'
import type { Prisma } from '../../../prisma/generated/client/client'
import { assertMember } from './members'
import { dateOnlyToDate, dateToDateOnly, isDateOnly } from '../../shared/date-only'
import { ACCOUNT_KINDS, INSTITUTIONS, type AccountSummary } from '../../shared/ledger'
import type { MemberColour } from '../../shared/members'

const cardInput = z.object({
  id: z.string().min(1).optional(),
  last4: z.string().regex(/^\d{4}$/),
  holderMemberId: z.string().nullable().default(null),
})

const accountInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(ACCOUNT_KINDS),
  institution: z.enum(INSTITUTIONS),
  currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'),
  openingBalanceCents: z.number().int(),
  openingDate: z.string().refine(isDateOnly),
  /** null = joint */
  holderMemberId: z.string().nullable().default(null),
  /** The whole card list, in order; left out = the cards stay as they are */
  cards: z.array(cardInput).max(20).optional(),
})

type CardRow = z.infer<typeof cardInput>

/** Throws: 'INVALID_INPUT', 'CARD_DUPLICATE' */
function parseAccountInput(input: unknown) {
  const parsed = accountInput.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  const { openingDate, cards, ...rest } = parsed.data
  if (cards && new Set(cards.map(c => c.last4)).size !== cards.length) throw new Error('CARD_DUPLICATE')
  return { data: { ...rest, openingDate: dateOnlyToDate(openingDate) }, cards }
}

/**
 * Every holder named must be an active member, except one that is already
 * stored (an archived parent stays on their old accounts and cards).
 * Throws: 'MEMBER_NOT_FOUND'
 */
async function assertHolders(ids: (string | null)[], stored: (string | null)[] = []): Promise<void> {
  const keep = new Set(stored)
  for (const id of new Set(ids)) if (id && !keep.has(id)) await assertMember(id)
}

/**
 * Makes the account's cards match the list: removes the missing ones, updates
 * the known ones, adds the new ones, in the list's order.
 * Throws: 'CARD_NOT_FOUND' (an id of another account's card)
 */
async function syncCards(tx: Prisma.TransactionClient, accountId: string, cards: CardRow[]): Promise<void> {
  const existing = await tx.card.findMany({ where: { accountId }, select: { id: true, last4: true } })
  const known = new Map(existing.map(c => [c.id, c]))
  if (cards.some(c => c.id && !known.has(c.id))) throw new Error('CARD_NOT_FOUND')
  const kept = new Set(cards.map(c => c.id).filter(Boolean))
  await tx.card.deleteMany({ where: { accountId, id: { notIn: [...kept] as string[] } } })
  // Renumbered cards step aside first, so two cards can swap digits without tripping the unique index
  const renumbered = cards.filter(c => c.id && known.get(c.id)!.last4 !== c.last4)
  for (const c of renumbered) await tx.card.update({ where: { id: c.id }, data: { last4: `~${c.id}` } })
  for (const [sortOrder, c] of cards.entries()) {
    const data = { last4: c.last4, holderMemberId: c.holderMemberId, sortOrder }
    if (c.id) await tx.card.update({ where: { id: c.id }, data })
    else await tx.card.create({ data: { ...data, accountId } })
  }
}

/** What the app says an account held at the end of a day: opening balance + every row up to it */
export async function balanceOn(accountId: string, date: string): Promise<number> {
  const [account, sum] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: { openingBalanceCents: true } }),
    prisma.transaction.aggregate({ where: { accountId, bookedAt: { lte: dateOnlyToDate(date) } }, _sum: { amountCents: true } }),
  ])
  return account.openingBalanceCents + (sum._sum.amountCents ?? 0)
}

const holderSelect = { select: { name: true, colour: true } } as const

/** Active accounts by sort order (archived ones too when asked), each with its balance, holder and cards */
export async function listAccounts(opts: { includeArchived?: boolean } = {}): Promise<AccountSummary[]> {
  const [accounts, sums, imports] = await Promise.all([
    prisma.account.findMany({
      where: opts.includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        holder: holderSelect,
        cards: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { holder: holderSelect } },
      },
    }),
    prisma.transaction.groupBy({ by: ['accountId'], _sum: { amountCents: true }, _count: { _all: true } }),
    prisma.importBatch.groupBy({ by: ['accountId'], where: { undoneAt: null }, _max: { dateTo: true } }),
  ])
  const sumBy = new Map(sums.map(s => [s.accountId, s]))
  const importedBy = new Map(imports.map(i => [i.accountId, i._max.dateTo]))
  return accounts.map(a => {
    const sum = sumBy.get(a.id)
    const importedUntil = importedBy.get(a.id)
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      institution: a.institution,
      currency: a.currency,
      openingBalanceCents: a.openingBalanceCents,
      openingDate: dateToDateOnly(a.openingDate),
      balanceCents: a.openingBalanceCents + (sum?._sum.amountCents ?? 0),
      transactionCount: sum?._count._all ?? 0,
      importedUntil: importedUntil ? dateToDateOnly(importedUntil) : null,
      archived: a.archivedAt !== null,
      holderMemberId: a.holderMemberId,
      holderName: a.holder?.name ?? null,
      holderColour: (a.holder?.colour as MemberColour | undefined) ?? null,
      cards: a.cards.map(c => ({
        id: c.id,
        last4: c.last4,
        holderMemberId: c.holderMemberId,
        holderName: c.holder?.name ?? null,
        holderColour: (c.holder?.colour as MemberColour | undefined) ?? null,
      })),
    }
  })
}

/** Throws: 'INVALID_INPUT', 'MEMBER_NOT_FOUND', 'CARD_DUPLICATE' */
export async function createAccount(input: unknown): Promise<string> {
  const { data, cards } = parseAccountInput(input)
  if (cards?.some(c => c.id)) throw new Error('INVALID_INPUT')
  await assertHolders([data.holderMemberId, ...(cards ?? []).map(c => c.holderMemberId)])
  const last = await prisma.account.aggregate({ _max: { sortOrder: true } })
  return prisma.$transaction(async tx => {
    const account = await tx.account.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } })
    if (cards) await syncCards(tx, account.id, cards)
    return account.id
  })
}

/** Several accounts at once (Quick setup), in the given order. Throws: 'INVALID_INPUT', 'MEMBER_NOT_FOUND' */
export async function createAccounts(inputs: unknown): Promise<string[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('INVALID_INPUT')
  const rows = inputs.map(i => parseAccountInput(i).data)
  await assertHolders(rows.map(r => r.holderMemberId))
  const last = await prisma.account.aggregate({ _max: { sortOrder: true } })
  const start = (last._max.sortOrder ?? -1) + 1
  const created = await prisma.$transaction(
    rows.map((data, i) => prisma.account.create({ data: { ...data, sortOrder: start + i } })),
  )
  return created.map(a => a.id)
}

/**
 * Saves the account, and its card list when one is given, in one write.
 * Throws: 'INVALID_INPUT', 'ACCOUNT_NOT_FOUND', 'MEMBER_NOT_FOUND', 'CARD_DUPLICATE', 'CARD_NOT_FOUND'
 */
export async function updateAccount(id: unknown, input: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const { data, cards } = parseAccountInput(input)
  const found = await prisma.account.findUnique({ where: { id }, select: { holderMemberId: true, cards: { select: { holderMemberId: true } } } })
  if (!found) throw new Error('ACCOUNT_NOT_FOUND')
  await assertHolders(
    [data.holderMemberId, ...(cards ?? []).map(c => c.holderMemberId)],
    [found.holderMemberId, ...found.cards.map(c => c.holderMemberId)],
  )
  await prisma.$transaction(async tx => {
    await tx.account.update({ where: { id }, data })
    if (cards) await syncCards(tx, id, cards)
  })
}

/** Hides the account from lists and pickers; its transactions and cards stay. Throws: 'ACCOUNT_NOT_FOUND' */
export async function archiveAccount(id: unknown, archived = true): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const found = await prisma.account.findUnique({ where: { id }, select: { id: true } })
  if (!found) throw new Error('ACCOUNT_NOT_FOUND')
  await prisma.account.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } })
}
