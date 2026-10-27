// Statement import against the database: preview a file, commit the user's choices,
// undo a whole import, list past imports. The pure steps live next to this file.

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../db/prisma'
import { dateOnlyToDate, dateToDateOnly } from '../../../shared/date-only'
import type { PreviewRow, PreviewSummary } from '../../../shared/statement-import'
import { readStatement } from './read-statement'
import { buildPreview } from './build-preview'
import { fileHash, payeeKey } from './fingerprint'
import { sortRules } from './apply-rules'
import { TWIN_WINDOW_DAYS } from './dedupe'
import { TRANSFER_WINDOW_DAYS } from './transfer-match'
import type { ProfileKey } from './profiles'

/** Parsed previews wait here until committed; the renderer never holds the file */
const PREVIEW_TTL_MS = 30 * 60_000
const MAX_PREVIEWS = 5

interface CachedPreview {
  accountId: string
  fileName: string
  fileHash: string
  rows: PreviewRow[]
  summary: PreviewSummary
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

export type PreviewResult =
  | {
      ok: true
      previewId: string
      accountId: string
      fileName: string
      profile: ProfileKey | 'saved'
      /** The same file was imported into this account before (and not undone) */
      sameFile: { importedAt: string; importedCount: number } | null
      summary: PreviewSummary
      rows: PreviewRow[]
    }
  | { ok: false; reason: 'NO_ROWS' | 'UNKNOWN_FORMAT'; sample: string[][] }

const shift = (date: string, days: number) => new Date(dateOnlyToDate(date).getTime() + days * 86_400_000)

/** Reads a statement for an account and says what would happen to each row. Throws: 'ACCOUNT_NOT_FOUND' */
export async function previewImport(accountId: string, fileName: string, bytes: Uint8Array): Promise<PreviewResult> {
  const account = await prisma.account.findUnique({ where: { id: accountId } })
  if (!account || account.archivedAt) throw new Error('ACCOUNT_NOT_FOUND')

  const read = readStatement(bytes, account)
  if (!read.ok) return read

  const dates = read.rows.map(r => r.bookedAt).filter((d): d is string => d !== null).sort()
  const from = dates[0] ?? '1970-01-01'
  const to = dates[dates.length - 1] ?? '1970-01-01'
  const hash = fileHash(bytes)

  const [known, manual, others, rules, categorised, sameBatch] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId, OR: [{ fingerprint: { not: null } }, { bankReference: { not: null } }] },
      select: { fingerprint: true, bankReference: true },
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
        accountId: { not: accountId }, transferId: null, account: { archivedAt: null },
        bookedAt: { gte: shift(from, -TRANSFER_WINDOW_DAYS), lte: shift(to, TRANSFER_WINDOW_DAYS) },
      },
      select: { id: true, accountId: true, bookedAt: true, amountCents: true, account: { select: { name: true } } },
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
    bankReferences: new Set(known.map(k => k.bankReference).filter((r): r is string => r !== null)),
    manual: manual.map(m => ({ ...m, bookedAt: dateToDateOnly(m.bookedAt) })),
    transferCandidates: others.map(o => ({
      id: o.id, accountId: o.accountId, accountName: o.account.name, bookedAt: dateToDateOnly(o.bookedAt), amountCents: o.amountCents,
    })),
    rules: sortRules(rules),
    history,
  })

  const previewId = cachePreview({ accountId, fileName, fileHash: hash, rows, summary, createdAt: Date.now() })
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

/**
 * What to do with one row. Rows without a decision get the default for their status:
 * NEW → import with the suggestion, TRANSFER_MATCH → pair as a transfer, others → skip.
 * LINK (for a possible duplicate) gives the hand-entered row the statement's data, so there is still one row.
 */
const decisionSchema = z.object({
  line: z.number().int(),
  action: z.enum(['IMPORT', 'SKIP', 'LINK', 'TRANSFER']),
  categoryId: z.string().nullish(),
  payee: z.string().trim().max(120).nullish(),
})
export type ImportDecision = z.infer<typeof decisionSchema>

const commitSchema = z.object({ previewId: z.string(), decisions: z.array(decisionSchema).default([]) })

export interface CommitResult {
  batchId: string
  importedCount: number
  linkedCount: number
  skippedCount: number
  /** Imported rows still without a category */
  toCategorise: number
}

function defaultAction(row: PreviewRow): ImportDecision['action'] {
  if (row.status === 'NEW') return 'IMPORT'
  if (row.status === 'TRANSFER_MATCH') return 'TRANSFER'
  return 'SKIP'
}

/**
 * Writes the chosen rows in one database transaction. Fingerprints and bank
 * references are checked again inside it, so a second click never inserts twice.
 * Throws: 'INVALID_INPUT', 'IMPORT_PREVIEW_EXPIRED', 'IMPORT_NOTHING_TO_IMPORT'
 */
export async function commitImport(input: unknown): Promise<CommitResult> {
  const parsed = commitSchema.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  const preview = previews.get(parsed.data.previewId)
  if (!preview || Date.now() - preview.createdAt > PREVIEW_TTL_MS) throw new Error('IMPORT_PREVIEW_EXPIRED')
  // Taken out first: a double click finds it gone instead of importing twice
  previews.delete(parsed.data.previewId)

  const byLine = new Map(parsed.data.decisions.map(d => [d.line, d]))
  const plan = preview.rows
    .filter(r => r.status !== 'INVALID' && r.bookedAt !== null && r.amountCents !== null)
    .map(row => {
      const d = byLine.get(row.line)
      return { row, action: d?.action ?? defaultAction(row), categoryId: d?.categoryId, payee: d?.payee }
    })
    .filter(p => p.action !== 'SKIP')
  if (plan.length === 0) throw new Error('IMPORT_NOTHING_TO_IMPORT')

  const { accountId } = preview
  const usedRules = new Map<string, number>()

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
      },
    })
    let imported = 0
    let linked = 0
    let toCategorise = 0

    for (const { row, action, categoryId, payee } of plan) {
      const clash = await tx.transaction.findFirst({
        where: { accountId, OR: [{ fingerprint: row.fingerprint }, ...(row.bankReference ? [{ bankReference: row.bankReference }] : [])] },
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
        const other = row.transferWith ? await tx.transaction.findUnique({ where: { id: row.transferWith.id } }) : null
        if (other && other.transferId === null && other.amountCents === -row.amountCents!) {
          const transferId = randomUUID()
          await tx.transaction.update({ where: { id: other.id }, data: { transferId, categoryId: null } })
          await tx.transaction.create({
            data: { ...bankData, accountId, importBatchId: batch.id, bookedAt: dateOnlyToDate(row.bookedAt!), amountCents: row.amountCents!, transferId },
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
          bookedAt: dateOnlyToDate(row.bookedAt!),
          amountCents: row.amountCents!,
          categoryId: chosen,
          payee: payee !== undefined ? payee || null : row.suggestion?.payee ?? null,
        },
      })
      imported++
      if (!chosen) toCategorise++
    }

    for (const [id, n] of usedRules) await tx.categoryRule.update({ where: { id }, data: { hitCount: { increment: n } } })
    const skipped = preview.rows.length - imported - linked
    await tx.importBatch.update({ where: { id: batch.id }, data: { importedCount: imported + linked, skippedCount: skipped } })
    return { batchId: batch.id, importedCount: imported, linkedCount: linked, skippedCount: skipped, toCategorise }
  })
  return result
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

export interface ImportHistoryItem {
  id: string
  accountId: string
  accountName: string
  fileName: string
  dateFrom: string
  dateTo: string
  importedAt: string
  importedCount: number
  skippedCount: number
  undone: boolean
}

/** Past imports, newest first */
export async function listImports(accountId?: unknown): Promise<ImportHistoryItem[]> {
  const batches = await prisma.importBatch.findMany({
    where: typeof accountId === 'string' ? { accountId } : {},
    orderBy: { importedAt: 'desc' },
    include: { account: { select: { name: true } } },
    take: 200,
  })
  return batches.map(b => ({
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
  }))
}

/** Test hook: forget cached previews */
export function clearPreviews(): void {
  previews.clear()
}
