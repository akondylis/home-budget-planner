import { z } from 'zod'
import { prisma } from '../db/prisma'
import { dateOnlyToDate, dateToDateOnly, isDateOnly } from '../../shared/date-only'
import { ACCOUNT_KINDS, INSTITUTIONS, type AccountSummary } from '../../shared/ledger'

const accountInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(ACCOUNT_KINDS),
  institution: z.enum(INSTITUTIONS),
  currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'),
  openingBalanceCents: z.number().int(),
  openingDate: z.string().refine(isDateOnly),
})

/** Throws: 'INVALID_INPUT' */
function parseAccountInput(input: unknown) {
  const parsed = accountInput.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  const { openingDate, ...rest } = parsed.data
  return { ...rest, openingDate: dateOnlyToDate(openingDate) }
}

/** Active accounts by sort order (archived ones too when asked), each with its balance */
export async function listAccounts(opts: { includeArchived?: boolean } = {}): Promise<AccountSummary[]> {
  const [accounts, sums, imports] = await Promise.all([
    prisma.account.findMany({
      where: opts.includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
    }
  })
}

/** Throws: 'INVALID_INPUT' */
export async function createAccount(input: unknown): Promise<string> {
  const data = parseAccountInput(input)
  const last = await prisma.account.aggregate({ _max: { sortOrder: true } })
  const account = await prisma.account.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } })
  return account.id
}

/** Several accounts at once (Quick setup), in the given order. Throws: 'INVALID_INPUT' */
export async function createAccounts(inputs: unknown): Promise<string[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('INVALID_INPUT')
  const rows = inputs.map(parseAccountInput)
  const last = await prisma.account.aggregate({ _max: { sortOrder: true } })
  const start = (last._max.sortOrder ?? -1) + 1
  const created = await prisma.$transaction(
    rows.map((data, i) => prisma.account.create({ data: { ...data, sortOrder: start + i } })),
  )
  return created.map(a => a.id)
}

/** Throws: 'INVALID_INPUT', 'ACCOUNT_NOT_FOUND' */
export async function updateAccount(id: unknown, input: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const data = parseAccountInput(input)
  const found = await prisma.account.findUnique({ where: { id }, select: { id: true } })
  if (!found) throw new Error('ACCOUNT_NOT_FOUND')
  await prisma.account.update({ where: { id }, data })
}

/** Hides the account from lists and pickers; its transactions stay. Throws: 'ACCOUNT_NOT_FOUND' */
export async function archiveAccount(id: unknown, archived = true): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const found = await prisma.account.findUnique({ where: { id }, select: { id: true } })
  if (!found) throw new Error('ACCOUNT_NOT_FOUND')
  await prisma.account.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } })
}

