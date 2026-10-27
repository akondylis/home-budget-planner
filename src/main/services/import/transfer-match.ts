// Layer 4 of the import plan: money moving between own accounts. A card payment
// is "ΠΛΗΡΩΜΗ ΚΑΡΤΑΣ" −€300 in the bank account and +€300 on the card; when the
// other side is already in the app, the two are paired so the payment counts once
// and never as an expense.

import { normalise } from '../../../shared/search-normalise'
import type { TransferHint } from '../../../shared/statement-import'
import { daysBetween } from './dedupe'

export const TRANSFER_WINDOW_DAYS = 5

export interface TransferCandidate {
  id: string
  accountId: string
  accountName: string
  bookedAt: string
  amountCents: number
}

/**
 * For each row, the row in another own account with the opposite amount within
 * ±5 days (nearest first), or null. Each candidate pairs with one row at most.
 * Rows that are not new (null amount or date) are skipped.
 */
export function matchTransfers(
  rows: { bookedAt: string | null; amountCents: number | null; eligible: boolean }[],
  accountId: string,
  candidates: TransferCandidate[],
): (TransferCandidate | null)[] {
  const used = new Set<string>()
  return rows.map(row => {
    if (!row.eligible || row.bookedAt === null || row.amountCents === null) return null
    const match = candidates
      .filter(c => !used.has(c.id) && c.accountId !== accountId && c.amountCents === -row.amountCents!
        && daysBetween(c.bookedAt, row.bookedAt!) <= TRANSFER_WINDOW_DAYS)
      .sort((a, b) => daysBetween(a.bookedAt, row.bookedAt!) - daysBetween(b.bookedAt, row.bookedAt!))[0]
    if (!match) return null
    used.add(match.id)
    return match
  })
}

// Bank wording, normalised: a card being paid off, or cash taken out
const CARD_PAYMENT = ['pliromi kartas', 'exoflisi kartas', 'pliromi pistotikis', 'card payment', 'payment thank you', 'pliromi logariasmou kartas']
const ATM = ['analipsi', 'atm', 'cash withdrawal']

/** Says when a row reads like a card payment or an ATM withdrawal, so the user can mark it as a transfer */
export function transferHint(description: string): TransferHint | null {
  const text = ` ${normalise(description)} `
  if (CARD_PAYMENT.some(p => text.includes(` ${p} `))) return 'CARD_PAYMENT'
  if (ATM.some(p => text.includes(` ${p} `))) return 'ATM'
  return null
}
