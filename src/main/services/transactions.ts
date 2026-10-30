import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '../db/prisma'
import type { Prisma } from '../../../prisma/generated/client/client'
import { assertMember } from './members'
import { dateOnlyToDate, dateToDateOnly, isDateOnly, isMonth, monthRange } from '../../shared/date-only'
import {
  CATEGORY_TYPES,
  LOG_SORT_KEYS,
  signedAmount,
  type PayeeSuggestion,
  type TransactionFilter,
  type TransactionPage,
  type TransactionRow,
} from '../../shared/ledger'
import { HOUSEHOLD, type MemberColour } from '../../shared/members'
import { sumMoney } from '../../shared/money'
import { queryMatcher, rowComparator } from './transaction-search'

export const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

const text = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)
const amount = z.number().int()
const bookedAt = z.string().refine(isDateOnly)

const transactionInput = z.object({
  kind: z.enum(['EXPENSE', 'INCOME']),
  accountId: z.string().min(1),
  amountCents: amount,
  bookedAt,
  categoryId: z.string().nullable(),
  payee: text(120),
  note: text(500),
  /** Who it was for; null = the household */
  memberId: z.string().nullable().default(null),
  /** Who is entering it (create only) */
  createdByMemberId: z.string().nullish(),
})

const transferInput = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amountCents: amount,
  bookedAt,
  note: text(500),
  createdByMemberId: z.string().nullish(),
})

const filterInput = z.object({
  month: z.string().refine(isMonth).optional(),
  accountId: z.string().optional(),
  categoryType: z.enum(CATEGORY_TYPES).optional(),
  categoryId: z.string().optional(),
  uncategorised: z.boolean().optional(),
  importBatchId: z.string().optional(),
  /** A member id, or HOUSEHOLD for rows that are for no one parent */
  memberId: z.string().optional(),
  query: z.string().trim().max(100).optional(),
  sort: z.enum(LOG_SORT_KEYS).default('date'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  return parsed.data
}

/** Positive whole cents. Throws: 'INVALID_AMOUNT' */
function assertAmount(cents: number): void {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('INVALID_AMOUNT')
}

/** Throws: 'ACCOUNT_NOT_FOUND' (missing or archived) */
async function assertAccount(id: string): Promise<{ kind: string }> {
  const account = await prisma.account.findUnique({ where: { id }, select: { archivedAt: true, kind: true } })
  if (!account || account.archivedAt) throw new Error('ACCOUNT_NOT_FOUND')
  return account
}

/** Income and expense need a category. Throws: 'CATEGORY_REQUIRED', 'CATEGORY_NOT_FOUND' */
async function assertCategory(id: string | null): Promise<void> {
  if (!id) throw new Error('CATEGORY_REQUIRED')
  const category = await prisma.category.findUnique({ where: { id }, select: { id: true } })
  if (!category) throw new Error('CATEGORY_NOT_FOUND')
}

/** Checks the member a row is for and the one entering it. Throws: 'MEMBER_NOT_FOUND' */
async function assertMembers(memberId: string | null | undefined, createdByMemberId?: string | null): Promise<void> {
  if (memberId) await assertMember(memberId)
  if (createdByMemberId) await assertMember(createdByMemberId, { allowArchived: true })
}

// ── Reading ──────────────────────────────────────────────────────────────────

function filterWhere(f: z.infer<typeof filterInput>): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = []
  if (f.month) and.push({ bookedAt: monthRange(f.month) })
  if (f.accountId) and.push({ accountId: f.accountId })
  if (f.importBatchId) and.push({ importBatchId: f.importBatchId })
  if (f.memberId) and.push({ memberId: f.memberId === HOUSEHOLD ? null : f.memberId })
  if (f.categoryType) and.push({ category: { type: f.categoryType } })
  // A group stands for all of its categories
  if (f.categoryId) and.push({ OR: [{ categoryId: f.categoryId }, { category: { parentId: f.categoryId } }] })
  return { AND: and }
}

const UNCATEGORISED: Prisma.TransactionWhereInput = { categoryId: null, transferId: null }

const ROW_INCLUDE = {
  account: { select: { name: true } },
  category: { select: { name: true, type: true, parent: { select: { name: true } } } },
  member: { select: { name: true, colour: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.TransactionInclude

type FullRow = Prisma.TransactionGetPayload<{ include: typeof ROW_INCLUDE }>
type Filter = z.infer<typeof filterInput>
type PageResult = Omit<TransactionPage, 'rows' | 'page' | 'pageSize'> & { rows: FullRow[] }

/** One page of the log, newest first unless sorted, with the totals of everything the filter matches */
export async function listTransactions(input: unknown = {}): Promise<TransactionPage> {
  const f = parse(filterInput, input ?? {})
  const base = filterWhere(f)
  // Search and text sorts fold Greek case and accents, which SQLite cannot
  const result = f.query || f.sort === 'description' || f.sort === 'category' ? await memoryPage(f, base) : await sqlPage(f, base)
  return { ...result, rows: await toRows(result.rows), page: f.page, pageSize: f.pageSize }
}

/** Unsearched, sorted by date or amount: paging and totals in SQL */
async function sqlPage(f: Filter, base: Prisma.TransactionWhereInput): Promise<PageResult> {
  const where: Prisma.TransactionWhereInput = f.uncategorised ? { AND: [base, UNCATEGORISED] } : base
  const notTransfer: Prisma.TransactionWhereInput = { AND: [where, { transferId: null }] }
  const orderBy: Prisma.TransactionOrderByWithRelationInput[] = f.sort === 'amount'
    ? [{ amountCents: f.direction }, { bookedAt: 'desc' }, { createdAt: 'desc' }]
    : [{ bookedAt: f.direction }, { createdAt: f.direction }]

  const [rows, total, income, expense, uncategorisedCount] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy, skip: (f.page - 1) * f.pageSize, take: f.pageSize, include: ROW_INCLUDE }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where: { AND: [notTransfer, { amountCents: { gt: 0 } }] }, _sum: { amountCents: true } }),
    prisma.transaction.aggregate({ where: { AND: [notTransfer, { amountCents: { lt: 0 } }] }, _sum: { amountCents: true } }),
    prisma.transaction.count({ where: { AND: [base, UNCATEGORISED] } }),
  ])
  return {
    rows,
    total,
    incomeCents: income._sum.amountCents ?? 0,
    expenseCents: expense._sum.amountCents ?? 0,
    uncategorisedCount,
  }
}

/** Searched or sorted by text: the filter's rows are matched and ordered in memory, then one page is loaded in full */
async function memoryPage(f: Filter, base: Prisma.TransactionWhereInput): Promise<PageResult> {
  const light = await prisma.transaction.findMany({
    where: base,
    select: {
      id: true, bookedAt: true, createdAt: true, amountCents: true, payee: true, description: true, note: true,
      transferId: true, categoryId: true, account: { select: { name: true } }, category: { select: { name: true } },
    },
  })
  const otherAccount = light.some(r => r.transferId) ? await transferAccountNames() : new Map<string, string>()
  const rows = light.map(r => ({
    ...r,
    accountName: r.account.name,
    categoryName: r.category?.name ?? null,
    transferAccountName: r.transferId ? otherAccount.get(`${r.transferId}:${r.id}`) ?? null : null,
  }))
  const searched = f.query ? rows.filter(queryMatcher(f.query)) : rows
  const isUncategorised = (r: (typeof rows)[number]) => r.categoryId === null && r.transferId === null
  const matched = (f.uncategorised ? searched.filter(isUncategorised) : searched)
    .sort(rowComparator({ key: f.sort, direction: f.direction }))

  const pageIds = matched.slice((f.page - 1) * f.pageSize, f.page * f.pageSize).map(r => r.id)
  const full = await prisma.transaction.findMany({ where: { id: { in: pageIds } }, include: ROW_INCLUDE })
  const byId = new Map(full.map(r => [r.id, r]))
  const counted = matched.filter(r => r.transferId === null)
  return {
    rows: pageIds.map(id => byId.get(id)).filter((r): r is FullRow => r !== undefined),
    total: matched.length,
    incomeCents: sumMoney(counted.filter(r => r.amountCents > 0).map(r => r.amountCents)),
    expenseCents: sumMoney(counted.filter(r => r.amountCents < 0).map(r => r.amountCents)),
    uncategorisedCount: searched.filter(isUncategorised).length,
  }
}

/** For every transfer row, keyed `transferId:rowId`, the account on the other side */
async function transferAccountNames(): Promise<Map<string, string>> {
  const sides = await prisma.transaction.findMany({
    where: { transferId: { not: null } },
    select: { id: true, transferId: true, account: { select: { name: true } } },
  })
  const pairs = new Map<string, typeof sides>()
  for (const s of sides) pairs.set(s.transferId!, [...(pairs.get(s.transferId!) ?? []), s])
  const names = new Map<string, string>()
  for (const [transferId, pair] of pairs) {
    for (const a of pair) {
      const b = pair.find(s => s.id !== a.id)
      if (b) names.set(`${transferId}:${a.id}`, b.account.name)
    }
  }
  return names
}

/** Page rows as the renderer sees them, with the other side of each transfer in one query */
async function toRows(rows: FullRow[]): Promise<TransactionRow[]> {
  const transferIds = rows.map(r => r.transferId).filter((id): id is string => id !== null)
  const otherSides = transferIds.length
    ? await prisma.transaction.findMany({
        where: { transferId: { in: transferIds }, id: { notIn: rows.map(r => r.id) } },
        select: { id: true, transferId: true, accountId: true, account: { select: { name: true } } },
      })
    : []
  // Both sides can be on the page; then each points at the other
  const sides = [...otherSides, ...rows.filter(r => r.transferId)]

  return rows.map((r): TransactionRow => {
    const other = r.transferId ? sides.find(s => s.transferId === r.transferId && s.id !== r.id) : undefined
    return {
      id: r.id,
      accountId: r.accountId,
      accountName: r.account.name,
      bookedAt: dateToDateOnly(r.bookedAt),
      amountCents: r.amountCents,
      description: r.description,
      payee: r.payee,
      note: r.note,
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
      categoryGroupName: r.category?.parent?.name ?? null,
      categoryType: r.category?.type ?? null,
      transferId: r.transferId,
      transferAccountId: other?.accountId ?? null,
      transferAccountName: other?.account.name ?? null,
      importBatchId: r.importBatchId,
      memberId: r.memberId,
      memberName: r.member?.name ?? null,
      memberColour: (r.member?.colour as MemberColour | undefined) ?? null,
      createdByName: r.createdBy?.name ?? null,
    }
  })
}

/** Past payees, latest first, with the category, account and member used last time (form defaults) */
export async function listPayeeSuggestions(): Promise<PayeeSuggestion[]> {
  const rows = await prisma.transaction.findMany({
    where: { payee: { not: null }, transferId: null },
    orderBy: [{ bookedAt: 'desc' }, { createdAt: 'desc' }],
    select: { payee: true, categoryId: true, accountId: true, memberId: true },
    take: 2000,
  })
  const seen = new Map<string, PayeeSuggestion>()
  for (const r of rows) {
    const key = r.payee!.toLocaleLowerCase()
    if (!seen.has(key)) seen.set(key, { payee: r.payee!, categoryId: r.categoryId, accountId: r.accountId, memberId: r.memberId })
  }
  return [...seen.values()]
}

// ── Income and expenses ──────────────────────────────────────────────────────

/**
 * An expense or income entered by hand.
 * Throws: 'INVALID_INPUT', 'INVALID_AMOUNT', 'ACCOUNT_NOT_FOUND', 'CATEGORY_REQUIRED', 'CATEGORY_NOT_FOUND',
 * 'MEMBER_NOT_FOUND'
 */
export async function createTransaction(input: unknown): Promise<string> {
  const data = parse(transactionInput, input)
  assertAmount(data.amountCents)
  await assertAccount(data.accountId)
  await assertCategory(data.categoryId)
  await assertMembers(data.memberId, data.createdByMemberId)
  const created = await prisma.transaction.create({
    data: {
      accountId: data.accountId,
      bookedAt: dateOnlyToDate(data.bookedAt),
      amountCents: signedAmount(data.kind, data.amountCents),
      description: data.payee ?? '',
      payee: data.payee,
      categoryId: data.categoryId,
      note: data.note,
      memberId: data.memberId,
      createdByMemberId: data.createdByMemberId ?? null,
    },
  })
  return created.id
}

/**
 * Saves an edited expense or income. An imported row keeps its bank text and
 * fingerprint, so a later import still recognises it; who entered a row never changes.
 * Throws: as createTransaction, plus 'TRANSACTION_NOT_FOUND', 'TRANSACTION_IS_TRANSFER'
 */
export async function updateTransaction(id: unknown, input: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const data = parse(transactionInput, input)
  const current = await prisma.transaction.findUnique({ where: { id } })
  if (!current) throw new Error('TRANSACTION_NOT_FOUND')
  if (current.transferId) throw new Error('TRANSACTION_IS_TRANSFER')
  assertAmount(data.amountCents)
  if (data.accountId !== current.accountId) await assertAccount(data.accountId)
  await assertCategory(data.categoryId)
  if (data.memberId !== current.memberId) await assertMembers(data.memberId)
  await prisma.transaction.update({
    where: { id },
    data: {
      accountId: data.accountId,
      bookedAt: dateOnlyToDate(data.bookedAt),
      amountCents: signedAmount(data.kind, data.amountCents),
      payee: data.payee,
      categoryId: data.categoryId,
      note: data.note,
      memberId: data.memberId,
      ...(current.importBatchId ? {} : { description: data.payee ?? '' }),
    },
  })
}

/** Puts the same category on many rows (null clears it); transfers are skipped. Returns how many changed. */
export async function setCategory(ids: unknown, categoryId: unknown): Promise<number> {
  if (!Array.isArray(ids) || !ids.every(i => typeof i === 'string')) throw new Error('INVALID_INPUT')
  if (categoryId !== null && typeof categoryId !== 'string') throw new Error('INVALID_INPUT')
  if (categoryId) await assertCategory(categoryId)
  const result = await prisma.transaction.updateMany({
    where: { id: { in: ids as string[] }, transferId: null },
    data: { categoryId: categoryId as string | null },
  })
  return result.count
}

/** Marks many rows as for one member (null = the household); transfers are skipped. Returns how many changed. */
export async function setMember(ids: unknown, memberId: unknown): Promise<number> {
  if (!Array.isArray(ids) || !ids.every(i => typeof i === 'string')) throw new Error('INVALID_INPUT')
  if (memberId !== null && typeof memberId !== 'string') throw new Error('INVALID_INPUT')
  if (memberId) await assertMember(memberId)
  const result = await prisma.transaction.updateMany({
    where: { id: { in: ids as string[] }, transferId: null },
    data: { memberId: memberId as string | null },
  })
  return result.count
}

/**
 * Puts the same payee on many rows ('' or null clears it); transfers are skipped.
 * Like an edit, a hand-entered row's description follows its payee; an imported row keeps its bank text.
 * Returns how many changed.
 */
export async function setPayee(ids: unknown, payee: unknown): Promise<number> {
  if (!Array.isArray(ids) || !ids.every(i => typeof i === 'string')) throw new Error('INVALID_INPUT')
  const value = parse(text(120), payee)
  const where = { id: { in: ids as string[] }, transferId: null }
  const [imported, manual] = await prisma.$transaction([
    prisma.transaction.updateMany({ where: { ...where, importBatchId: { not: null } }, data: { payee: value } }),
    prisma.transaction.updateMany({ where: { ...where, importBatchId: null }, data: { payee: value, description: value ?? '' } }),
  ])
  return imported.count + manual.count
}

// ── Transfers ────────────────────────────────────────────────────────────────

/**
 * Money on a meal-voucher card can only be spent on food, never moved out.
 * Throws: 'INVALID_INPUT', 'INVALID_AMOUNT', 'SAME_ACCOUNT', 'ACCOUNT_NOT_FOUND', 'MEMBER_NOT_FOUND', 'VOUCHER_NO_TRANSFER_OUT'
 */
async function parseTransfer(input: unknown) {
  const data = parse(transferInput, input)
  assertAmount(data.amountCents)
  if (data.fromAccountId === data.toAccountId) throw new Error('SAME_ACCOUNT')
  if ((await assertAccount(data.fromAccountId)).kind === 'MEAL_VOUCHER') throw new Error('VOUCHER_NO_TRANSFER_OUT')
  await assertAccount(data.toAccountId)
  await assertMembers(null, data.createdByMemberId)
  return data
}

/**
 * Money moved between two own accounts: two rows sharing a transferId, written
 * together. Never income or expense. Returns the transferId.
 * Throws: as parseTransfer
 */
export async function createTransfer(input: unknown): Promise<string> {
  const data = await parseTransfer(input)
  const transferId = randomUUID()
  const shared = { bookedAt: dateOnlyToDate(data.bookedAt), note: data.note, transferId, createdByMemberId: data.createdByMemberId ?? null }
  await prisma.$transaction([
    prisma.transaction.create({ data: { ...shared, accountId: data.fromAccountId, amountCents: -data.amountCents } }),
    prisma.transaction.create({ data: { ...shared, accountId: data.toAccountId, amountCents: data.amountCents } }),
  ])
  return transferId
}

/**
 * Rewrites both sides of a transfer. A side that came from a statement stays in its account.
 * Throws: as parseTransfer, plus 'TRANSACTION_NOT_FOUND', 'TRANSFER_IMPORTED'
 */
export async function updateTransfer(transferId: unknown, input: unknown): Promise<void> {
  if (typeof transferId !== 'string') throw new Error('INVALID_INPUT')
  const data = await parseTransfer(input)
  const sides = await prisma.transaction.findMany({ where: { transferId } })
  const from = sides.find(s => s.amountCents < 0)
  const to = sides.find(s => s.amountCents > 0)
  if (!from || !to) throw new Error('TRANSACTION_NOT_FOUND')
  if ((from.importBatchId && from.accountId !== data.fromAccountId) || (to.importBatchId && to.accountId !== data.toAccountId)) {
    throw new Error('TRANSFER_IMPORTED')
  }
  const shared = { bookedAt: dateOnlyToDate(data.bookedAt), note: data.note }
  await prisma.$transaction([
    prisma.transaction.update({ where: { id: from.id }, data: { ...shared, accountId: data.fromAccountId, amountCents: -data.amountCents } }),
    prisma.transaction.update({ where: { id: to.id }, data: { ...shared, accountId: data.toAccountId, amountCents: data.amountCents } }),
  ])
}

/**
 * Pairs two existing rows as one transfer (e.g. a card payment seen in both the
 * account and the card statement). Their categories are cleared.
 * Throws: 'TRANSACTION_NOT_FOUND', 'TRANSFER_MISMATCH', 'VOUCHER_NO_TRANSFER_OUT'
 */
export async function linkTransfer(idA: unknown, idB: unknown): Promise<string> {
  if (typeof idA !== 'string' || typeof idB !== 'string' || idA === idB) throw new Error('INVALID_INPUT')
  const [a, b] = await Promise.all([
    prisma.transaction.findUnique({ where: { id: idA } }),
    prisma.transaction.findUnique({ where: { id: idB } }),
  ])
  if (!a || !b) throw new Error('TRANSACTION_NOT_FOUND')
  if (a.accountId === b.accountId || a.amountCents + b.amountCents !== 0 || a.amountCents === 0 || a.transferId || b.transferId) {
    throw new Error('TRANSFER_MISMATCH')
  }
  const source = await prisma.account.findUnique({ where: { id: (a.amountCents < 0 ? a : b).accountId }, select: { kind: true } })
  if (source?.kind === 'MEAL_VOUCHER') throw new Error('VOUCHER_NO_TRANSFER_OUT')
  const transferId = randomUUID()
  await prisma.transaction.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { transferId, categoryId: null } })
  return transferId
}

/**
 * Turns saved rows into transfers with another own account (e.g. ATM withdrawals → Cash): each row
 * loses its category and member, and its other side is written with the opposite amount. That side
 * joins the row's import, as at import time, so undoing the import removes both. All or nothing.
 * Throws: 'INVALID_INPUT', 'TRANSACTION_NOT_FOUND', 'TRANSFER_MISMATCH', 'SAME_ACCOUNT', 'ACCOUNT_NOT_FOUND', 'VOUCHER_NO_TRANSFER_OUT'
 */
export async function makeTransfers(ids: unknown, otherAccountId: unknown): Promise<string[]> {
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string') || typeof otherAccountId !== 'string') {
    throw new Error('INVALID_INPUT')
  }
  const unique = [...new Set(ids as string[])]
  const rows = await prisma.transaction.findMany({ where: { id: { in: unique } } })
  if (rows.length !== unique.length) throw new Error('TRANSACTION_NOT_FOUND')
  for (const row of rows) {
    if (row.transferId || row.amountCents === 0) throw new Error('TRANSFER_MISMATCH')
    if (row.accountId === otherAccountId) throw new Error('SAME_ACCOUNT')
  }
  const other = await assertAccount(otherAccountId)
  if (other.kind === 'MEAL_VOUCHER' && rows.some(r => r.amountCents > 0)) throw new Error('VOUCHER_NO_TRANSFER_OUT')
  const outgoingFrom = [...new Set(rows.filter(r => r.amountCents < 0).map(r => r.accountId))]
  if (outgoingFrom.length > 0) {
    const voucher = await prisma.account.findFirst({ where: { id: { in: outgoingFrom }, kind: 'MEAL_VOUCHER' }, select: { id: true } })
    if (voucher) throw new Error('VOUCHER_NO_TRANSFER_OUT')
  }
  const transferIds = rows.map(() => randomUUID())
  await prisma.$transaction(
    rows.flatMap((row, i) => [
      prisma.transaction.update({ where: { id: row.id }, data: { transferId: transferIds[i], categoryId: null, memberId: null } }),
      prisma.transaction.create({
        data: {
          accountId: otherAccountId,
          bookedAt: row.bookedAt,
          amountCents: -row.amountCents,
          description: row.payee || row.description,
          note: row.note,
          transferId: transferIds[i],
          importBatchId: row.importBatchId,
          createdByMemberId: row.createdByMemberId,
        },
      }),
    ]),
  )
  return transferIds
}

// ── Deleting ─────────────────────────────────────────────────────────────────

/**
 * Deletes a row. For a transfer, a hand-entered other side goes too; an imported
 * other side stays (it is on a statement) and becomes a row that needs a category.
 * Throws: 'TRANSACTION_NOT_FOUND'
 */
export async function deleteTransaction(id: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const row = await prisma.transaction.findUnique({ where: { id } })
  if (!row) throw new Error('TRANSACTION_NOT_FOUND')
  const others = row.transferId
    ? await prisma.transaction.findMany({ where: { transferId: row.transferId, id: { not: id } } })
    : []
  await prisma.$transaction([
    prisma.transaction.delete({ where: { id } }),
    ...others.map(o =>
      o.importBatchId
        ? prisma.transaction.update({ where: { id: o.id }, data: { transferId: null } })
        : prisma.transaction.delete({ where: { id: o.id } }),
    ),
  ])
}
