// Parsed statement rows + what the app already holds → one status and suggestion per row.
// Pure: import-service.ts loads the context from the database.

import { ROW_STATUSES, type PreviewRow, type PreviewSummary, type RowStatus } from '../../../shared/statement-import'
import { classifyRows, type ExistingRows } from './dedupe'
import { fingerprintRows, payeeKey } from './fingerprint'
import { matchTransfers, transferHint, type TransferCandidate } from './transfer-match'
import { suggestCategory, type RuleLike } from './apply-rules'
import type { ParsedRow } from './parse-rows'

export interface PreviewContext extends ExistingRows {
  /** Untransferred rows in the other own accounts, around the statement's dates */
  transferCandidates: TransferCandidate[]
  /** Sorted with sortRules() */
  rules: RuleLike[]
  /** Payee key → category last used */
  history: Map<string, string>
}

export function buildPreview(accountId: string, parsed: ParsedRow[], ctx: PreviewContext): { rows: PreviewRow[]; summary: PreviewSummary } {
  const fingerprints = fingerprintRows(accountId, parsed)
  const withPrints = parsed.map((row, i) => ({ ...row, fingerprint: fingerprints[i] }))
  const dedupe = classifyRows(withPrints, ctx)
  const transfers = matchTransfers(
    withPrints.map((row, i) => ({ ...row, eligible: dedupe[i].status === 'NEW' })),
    accountId,
    ctx.transferCandidates,
  )

  const rows = withPrints.map((row, i): PreviewRow => {
    const other = transfers[i]
    const status: RowStatus = other ? 'TRANSFER_MATCH' : dedupe[i].status
    const twin = dedupe[i].duplicateOf
    // A transfer match too: the user can turn it into a categorised row
    const needsCategory = status === 'NEW' || status === 'POSSIBLE_DUPLICATE' || status === 'TRANSFER_MATCH'
    const key = payeeKey(row.description)
    return {
      line: row.line,
      status,
      ...(row.problem ? { problem: row.problem } : {}),
      bookedAt: row.bookedAt,
      valueDate: row.valueDate,
      amountCents: row.amountCents,
      description: row.description,
      bankReference: row.bankReference,
      payeeKey: key,
      balanceAfterCents: row.balanceAfterCents,
      fingerprint: row.fingerprint,
      suggestion: needsCategory ? suggestCategory(key, accountId, ctx.rules, ctx.history) : null,
      duplicateOf: twin ? { id: twin.id, bookedAt: twin.bookedAt, amountCents: twin.amountCents, payee: twin.payee } : null,
      transferWith: other
        ? { id: other.id, accountId: other.accountId, accountName: other.accountName, bookedAt: other.bookedAt, amountCents: other.amountCents, description: other.description }
        : null,
      transferHint: status === 'NEW' ? transferHint(row.description) : null,
    }
  })
  return { rows, summary: summarise(rows) }
}

export function summarise(rows: PreviewRow[]): PreviewSummary {
  const counts = Object.fromEntries(ROW_STATUSES.map(s => [s, 0])) as Record<RowStatus, number>
  for (const row of rows) counts[row.status]++
  const dates = rows.map(r => r.bookedAt).filter((d): d is string => d !== null).sort()
  return {
    counts,
    toCategorise: rows.filter(r => r.status === 'NEW' && !r.suggestion && !r.transferHint).length,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
  }
}
