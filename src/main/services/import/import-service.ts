// Statement import against the database: preview a file, commit the user's choices,
// undo a whole import, list past imports. The pure steps live next to this file.

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../db/prisma'
import { dateOnlyToDate, dateToDateOnly } from '../../../shared/date-only'
import type {
  ColumnMapping,
  CommitResult,
  ImportDecision,
  ImportHistoryItem,
  PreviewResult,
  Reconciliation,
  PreviewRow,
  PreviewSummary,
} from '../../../shared/statement-import'
import { readStatement } from './read-statement'
import { buildPreview } from './build-preview'
import { fileHash, payeeKey } from './fingerprint'
import { sortRules } from './apply-rules'
import { refKey, TWIN_WINDOW_DAYS } from './dedupe'
import { TRANSFER_WINDOW_DAYS } from './transfer-match'
import { parseSavedMapping } from './profiles'
import { closingBalance, type StatementBalance } from './reconcile'
import { balanceOn } from '../accounts'
import { assertMember } from '../members'

export type { CommitResult, ImportDecision, ImportHistoryItem, PreviewResult }

/** Parsed previews wait here until committed; the renderer never holds the file */
const PREVIEW_TTL_MS = 30 * 60_000
const MAX_PREVIEWS = 5

interface CachedPreview {
  accountId: string
  fileName: string
  fileHash: string
  rows: PreviewRow[]
  summary: PreviewSummary
  /** Set in the column mapping step: saved on the account when the import is committed */
  mapping: ColumnMapping | null
  closing: StatementBalance | null
  createdAt: number
}

const previews = new Map<string, CachedPreview>()

function cachePreview(preview: CachedPreview): string {
  const now = Date.now()
  for (const [id, p] of previews) if (now - p.createdAt > PREVIEW_TTL_MS) previews.delete(id)
  while (previews.size >= MAX_PREVIEWS) previews.delete(previews.keys().next().value!)
  const id = randomUUID()
  previews.set(id, preview)
  return id
}

const shift = (date: string, days: number) => new Date(dateOnlyToDate(date).getTime() + days * 86_400_000)

/**
 * Reads a statement for an account and says what would happen to each row.
 * `mapping` comes from the column mapping step, when no preset knew the file.
 * Throws: 'INVALID_INPUT', 'ACCOUNT_NOT_FOUND'
 */
export async function previewImport(accountId: unknown, fileName: string, bytes: Uint8Array, mapping?: unknown): Promise<PreviewResult> {
  if (typeof accountId !== 'string') throw new Error('INVALID_INPUT')
  const userMapping = mapping === undefined || mapping === null ? null : parseSavedMapping(mapping)
  if (mapping && !userMapping) throw new Error('INVALID_INPUT')
  const account = await prisma.account.findUnique({ where: { id: accountId }, include: { institution: { select: { statementPreset: true } } } })
  if (!account || account.archivedAt) throw new Error('ACCOUNT_NOT_FOUND')

  const read = readStatement(bytes, { ...account, statementPreset: account.institution?.statementPreset ?? null }, userMapping ?? undefined)
  if (!read.ok) return read

  const dates = read.rows.map(r => r.bookedAt).filter((d): d is string => d !== null).sort()
  const from = dates[0] ?? '1970-01-01'
  const to = dates[dates.length - 1] ?? '1970-01-01'
  const hash = fileHash(bytes)

  const [known, manual, others, rules, categorised, sameBatch] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId, OR: [{ fingerprint: { not: null } }, { bankReference: { not: null } }] },
      select: { fingerprint: true, bankReference: true, amountCents: true },
    }),
    prisma.transaction.findMany({
      where: {
        accountId, fingerprint: null, transferId: null,
        bookedAt: { gte: shift(from, -TWIN_WINDOW_DAYS), lte: shift(to, TWIN_WINDOW_DAYS) },
      },
      select: { id: true, bookedAt: true, amountCents: true, payee: true },
    }),
    prisma.transaction.findMany({
      where: {
        // Meal-voucher cards never send or get money from a bank
        accountId: { not: accountId }, transferId: null, account: { archivedAt: null, kind: { not: 'MEAL_VOUCHER' } },
        bookedAt: { gte: shift(from, -TRANSFER_WINDOW_DAYS), lte: shift(to, TRANSFER_WINDOW_DAYS) },
      },
      select: { id: true, accountId: true, bookedAt: true, amountCents: true, description: true, payee: true, account: { select: { name: true } } },
    }),
    prisma.categoryRule.findMany({ where: { category: { archivedAt: null } } }),
    prisma.transaction.findMany({
      where: { categoryId: { not: null }, category: { archivedAt: null } },
      orderBy: [{ bookedAt: 'desc' }, { createdAt: 'desc' }],
      select: { description: true, payee: true, categoryId: true },
      take: 5000,
    }),
    prisma.importBatch.findFirst({ where: { accountId, fileHash: hash, undoneAt: null }, orderBy: { importedAt: 'desc' } }),
  ])

  const history = new Map<string, string>()
  for (const row of categorised) {
    const key = payeeKey(row.description || row.payee || '')
    if (key && !history.has(key)) history.set(key, row.categoryId!)
  }

  const { rows, summary } = buildPreview(accountId, read.rows, {
    fingerprints: new Set(known.map(k => k.fingerprint).filter((f): f is string => f !== null)),
    bankReferences: new Set(known.flatMap(k => (k.bankReference ? [refKey(k.bankReference, k.amountCents)] : []))),
    manual: manual.map(m => ({ ...m, bookedAt: dateToDateOnly(m.bookedAt) })),
    transferCandidates: others.map(o => ({
      id: o.id, accountId: o.accountId, accountName: o.account.name, bookedAt: dateToDateOnly(o.bookedAt), amountCents: o.amountCents,
      description: o.description || o.payee || '',
    })),
    rules: sortRules(rules),
    history,
  })

  const previewId = cachePreview({
    accountId, fileName, fileHash: hash, rows, summary, mapping: userMapping,
    closing: closingBalance(read.rows, read.mapping.options.invertSign),
    createdAt: Date.now(),
  })
  return {
    ok: true,
    previewId,
    accountId,
    fileName,
    profile: read.profile,
    sameFile: sameBatch ? { importedAt: sameBatch.importedAt.toISOString(), importedCount: sameBatch.importedCount } : null,
    summary,
    rows,
  }
}

// ── Commit ───────────────────────────────────────────────────────────────────

// Defaults per status are in defaultAction(); LINK (for a possible duplicate) gives the
// hand-entered row the statement's data, so there is still one row
const decisionSchema = z.object({
  line: z.number().int(),
  action: z.enum(['IMPORT', 'SKIP', 'LINK', 'TRANSFER']),
  categoryId: z.string().nullish(),
  payee: z.string().trim().max(120).nullish(),
  toAccountId: z.string().nullish(),
}) satisfies z.ZodType<ImportDecision>

const commitSchema = z.object({
  previewId: z.string(),
  decisions: z.array(decisionSchema).default([]),
  /** The member using the app; stamped on the batch and every row it writes */
  createdByMemberId: z.string().nullish(),
})

function defaultAction(row: PreviewRow): ImportDecision['action'] {
  if (row.status === 'NEW') return 'IMPORT'
  if (row.status === 'TRANSFER_MATCH') return 'TRANSFER'
  return 'SKIP'
}

/**
 * Writes the chosen rows in one database transaction. Fingerprints and bank
 * references are checked again inside it, so a second click never inserts twice.
 * Throws: 'INVALID_INPUT', 'IMPORT_PREVIEW_EXPIRED', 'IMPORT_NOTHING_TO_IMPORT', 'SAME_ACCOUNT', 'ACCOUNT_NOT_FOUND',
 * 'MEMBER_NOT_FOUND'
 */
export async function commitImport(input: unknown): Promise<CommitResult> {
  const parsed = commitSchema.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  const createdByMemberId = parsed.data.createdByMemberId ?? null
  if (createdByMemberId) await assertMember(createdByMemberId, { allowArchived: true })
  const preview = previews.get(parsed.data.previewId)
  if (!preview || Date.now() - preview.createdAt > PREVIEW_TTL_MS) throw new Error('IMPORT_PREVIEW_EXPIRED')
  // Taken out first: a double click finds it gone instead of importing twice
  previews.delete(parsed.data.previewId)

  const byLine = new Map(parsed.data.decisions.map(d => [d.line, d]))
  const plan = preview.rows
    .filter(r => r.status !== 'INVALID' && r.bookedAt !== null && r.amountCents !== null)
    .map(row => {
      const d = byLine.get(row.line)
      return { row, action: d?.action ?? defaultAction(row), categoryId: d?.categoryId, payee: d?.payee, toAccountId: d?.toAccountId ?? null }
    })
    .filter(p => p.action !== 'SKIP')
  if (plan.length === 0) throw new Error('IMPORT_NOTHING_TO_IMPORT')

  const { accountId } = preview
  const usedRules = new Map<string, number>()

  // Accounts that receive the other side of a transfer (an ATM withdrawal → Cash, or a suggested match the user changed)
  const targets = [...new Set(plan.map(p => (p.action === 'TRANSFER' ? p.toAccountId : null)).filter((id): id is string => id !== null))]
  if (targets.includes(accountId)) throw new Error('SAME_ACCOUNT')
  if (targets.length) {
    const found = await prisma.account.count({ where: { id: { in: targets }, archivedAt: null } })
    if (found !== targets.length) throw new Error('ACCOUNT_NOT_FOUND')
  }

  const result = await prisma.$transaction(async tx => {
    const batch = await tx.importBatch.create({
      data: {
        accountId,
        fileName: preview.fileName,
        fileHash: preview.fileHash,
        dateFrom: dateOnlyToDate(preview.summary.dateFrom!),
        dateTo: dateOnlyToDate(preview.summary.dateTo!),
        rowCount: preview.rows.length,
        importedCount: 0,
        skippedCount: 0,
        statementBalanceCents: preview.closing?.cents ?? null,
        statementBalanceDate: preview.closing ? dateOnlyToDate(preview.closing.date) : null,
        createdByMemberId,
      },
    })
    let imported = 0
    let linked = 0
    let toCategorise = 0

    for (const { row, action, categoryId, payee, toAccountId } of plan) {
      const clash = await tx.transaction.findFirst({
        where: {
          accountId,
          OR: [{ fingerprint: row.fingerprint }, ...(row.bankReference ? [{ bankReference: row.bankReference, amountCents: row.amountCents! }] : [])],
        },
        select: { id: true },
      })
      if (clash) continue

      const bankData = {
        description: row.description,
        fingerprint: row.fingerprint,
        bankReference: row.bankReference,
        balanceAfterCents: row.balanceAfterCents,
        valueDate: row.valueDate ? dateOnlyToDate(row.valueDate) : null,
      }

      if (action === 'LINK') {
        if (!row.duplicateOf) continue
        // The hand-entered row stays (with its category and payee) and becomes this statement row;
        // it is not part of the batch, so undoing the import leaves it in place
        await tx.transaction.update({ where: { id: row.duplicateOf.id }, data: { ...bankData, bookedAt: dateOnlyToDate(row.bookedAt!) } })
        linked++
        continue
      }

      if (action === 'TRANSFER') {
        // A chosen account wins over the suggested match
        const other = row.transferWith && !toAccountId ? await tx.transaction.findUnique({ where: { id: row.transferWith.id } }) : null
        if (other && other.transferId === null && other.amountCents === -row.amountCents!) {
          const transferId = randomUUID()
          await tx.transaction.update({ where: { id: other.id }, data: { transferId, categoryId: null } })
          await tx.transaction.create({
            data: { ...bankData, accountId, importBatchId: batch.id, createdByMemberId, bookedAt: dateOnlyToDate(row.bookedAt!), amountCents: row.amountCents!, transferId },
          })
          imported++
          continue
        }
        if (toAccountId) {
          // The other side has no statement of its own: write it too, as part of this import
          const transferId = randomUUID()
          const bookedAt = dateOnlyToDate(row.bookedAt!)
          await tx.transaction.create({
            data: { ...bankData, accountId, importBatchId: batch.id, createdByMemberId, bookedAt, amountCents: row.amountCents!, transferId },
          })
          await tx.transaction.create({
            data: { accountId: toAccountId, importBatchId: batch.id, createdByMemberId, bookedAt, amountCents: -row.amountCents!, transferId, description: row.description },
          })
          imported++
          continue
        }
        // The other side changed since the preview: import it as a plain row to categorise
      }

      const chosen = categoryId !== undefined ? categoryId : row.suggestion?.categoryId ?? null
      const rule = row.suggestion?.source.kind === 'rule' && chosen === row.suggestion.categoryId ? row.suggestion.source.ruleId : null
      if (rule) usedRules.set(rule, (usedRules.get(rule) ?? 0) + 1)
      await tx.transaction.create({
        data: {
          ...bankData,
          accountId,
          importBatchId: batch.id,
          createdByMemberId,
          bookedAt: dateOnlyToDate(row.bookedAt!),
          amountCents: row.amountCents!,
          categoryId: chosen,
          payee: payee !== undefined ? payee || null : row.suggestion?.payee ?? null,
        },
      })
      imported++
      // A card payment is not waiting for a category but for the card statement
      if (!chosen && !row.transferHint) toCategorise++
    }

    for (const [id, n] of usedRules) await tx.categoryRule.update({ where: { id }, data: { hitCount: { increment: n } } })
    const skipped = preview.rows.length - imported - linked
    await tx.importBatch.update({ where: { id: batch.id }, data: { importedCount: imported + linked, skippedCount: skipped } })
    if (preview.mapping) await tx.account.update({ where: { id: accountId }, data: { importMapping: preview.mapping as object } })
    return { batchId: batch.id, importedCount: imported, linkedCount: linked, skippedCount: skipped, toCategorise }
  })
  return { ...result, reconciliation: preview.closing && (await reconcile(accountId, preview.closing)) }
}

async function reconcile(accountId: string, closing: StatementBalance): Promise<Reconciliation> {
  return { date: closing.date, statementBalanceCents: closing.cents, appBalanceCents: await balanceOn(accountId, closing.date) }
}

// ── Undo and history ─────────────────────────────────────────────────────────

/**
 * Removes the rows an import created. The other side of a transfer it paired
 * stays and goes back to needing a category; hand-entered rows it linked stay.
 * Throws: 'IMPORT_NOT_FOUND', 'IMPORT_ALREADY_UNDONE'
 */
export async function undoImport(batchId: unknown): Promise<{ removedCount: number }> {
  if (typeof batchId !== 'string') throw new Error('INVALID_INPUT')
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error('IMPORT_NOT_FOUND')
  if (batch.undoneAt) throw new Error('IMPORT_ALREADY_UNDONE')

  return prisma.$transaction(async tx => {
    const rows = await tx.transaction.findMany({ where: { importBatchId: batchId }, select: { id: true, transferId: true } })
    const transferIds = rows.map(r => r.transferId).filter((t): t is string => t !== null)
    if (transferIds.length) {
      await tx.transaction.updateMany({
        where: { transferId: { in: transferIds }, OR: [{ importBatchId: null }, { importBatchId: { not: batchId } }] },
        data: { transferId: null },
      })
    }
    const removed = await tx.transaction.deleteMany({ where: { importBatchId: batchId } })
    await tx.importBatch.update({ where: { id: batchId }, data: { undoneAt: new Date() } })
    return { removedCount: removed.count }
  })
}

/** Past imports, newest first */
export async function listImports(accountId?: unknown): Promise<ImportHistoryItem[]> {
  const batches = await prisma.importBatch.findMany({
    where: typeof accountId === 'string' ? { accountId } : {},
    orderBy: { importedAt: 'desc' },
    include: { account: { select: { name: true } } },
    take: 200,
  })
  return Promise.all(batches.map(async b => ({
    id: b.id,
    accountId: b.accountId,
    accountName: b.account.name,
    fileName: b.fileName,
    dateFrom: dateToDateOnly(b.dateFrom),
    dateTo: dateToDateOnly(b.dateTo),
    importedAt: b.importedAt.toISOString(),
    importedCount: b.importedCount,
    skippedCount: b.skippedCount,
    undone: b.undoneAt !== null,
    reconciliation: b.undoneAt === null && b.statementBalanceCents !== null && b.statementBalanceDate
      ? await reconcile(b.accountId, { date: dateToDateOnly(b.statementBalanceDate), cents: b.statementBalanceCents })
      : null,
  })))
}

/** Test hook: forget cached previews */
export function clearPreviews(): void {
  previews.clear()
}
