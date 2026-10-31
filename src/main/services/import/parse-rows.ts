// Statement rows → movements with a date, signed cents and the bank's text.

import { normalise } from '../../../shared/search-normalise'
import { parseDateInOrder, type DateOrder } from '../../../shared/date-format'
import type { DecimalSeparator, RowProblem } from '../../../shared/statement-import'
import type { ResolvedMapping } from './profiles'

export interface ParsedRow {
  /** 1-based line in the file */
  line: number
  bookedAt: string | null
  valueDate: string | null
  /** Signed: money in > 0, money out < 0 */
  amountCents: number | null
  /** Trimmed, spaces collapsed */
  description: string
  bankReference: string | null
  balanceAfterCents: number | null
  problem?: RowProblem
}

/**
 * Statement amount → integer cents. The decimal mark is known from the bank, so
 * "1.234" with ',' decimals is 1234 euros, not 1,234. Accepts "1.234,56",
 * "-12,50", "12,50-", "(12,50)", "+5", "€ 12,50", "12,50 EUR". null when not a number.
 * Same rules as parseMoney() in src/shared/money.ts, with the separator given.
 */
export function parseStatementAmount(text: string, decimal: DecimalSeparator): number | null {
  let t = text.replace(/ /g, ' ').replace(/€|EUR/gi, '').replace(/\s+/g, '')
  if (t === '') return null
  let negative = false
  if (/^\(.*\)$/.test(t)) {
    negative = true
    t = t.slice(1, -1)
  }
  if (t.endsWith('-')) {
    negative = !negative
    t = t.slice(0, -1)
  } else if (t.startsWith('-')) {
    negative = !negative
    t = t.slice(1)
  } else if (t.startsWith('+') || t.endsWith('+')) {
    t = t.replace(/^\+|\+$/g, '')
  }
  const grouping = decimal === ',' ? '.' : ','
  const parts = t.split(grouping).join('').split(decimal)
  if (parts.length > 2 || !/^\d+$/.test(parts[0] || '0') || (parts[0] === '' && !parts[1])) return null
  const fraction = parts[1] ?? ''
  if (!/^\d{0,2}$/.test(fraction)) return null
  const cents = Number(parts[0] || '0') * 100 + Number(fraction.padEnd(2, '0'))
  return negative && cents !== 0 ? -cents : cents
}

/** Statement date (a time after it is ignored) → 'yyyy-MM-dd'; the year must be there */
export function parseStatementDate(text: string, order: DateOrder): string | null {
  const datePart = text.trim().split(/\s+|T/)[0] ?? ''
  if (datePart.split(/[/.\-]/).length !== 3) return null
  return parseDateInOrder(datePart, order)
}

const cell = (row: string[], index: number | undefined) => (index === undefined ? '' : (row[index] ?? '').trim())

/**
 * Rows after the header; lines without a date (totals, notes) are not movements and are left out,
 * as are rows a bank layout's `keep` rule rules out (Revolut's reverted payments).
 * `currency` is the account's: with a layout that names a currency column, other rows cannot be read.
 */
export function parseRows(rows: string[][], mapping: ResolvedMapping, currency = 'EUR'): ParsedRow[] {
  const { columns: c, options: o, extras: x = {} } = mapping
  const debitFlags = new Set(o.debitFlags.map(f => normalise(f) || f))
  const out: ParsedRow[] = []

  for (let r = mapping.headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    const dateText = cell(row, c.date)
    if (dateText === '') continue
    if (x.keep?.some(k => !k.values.includes(cell(row, k.column)))) continue

    const amount = (index: number | undefined) => parseStatementAmount(cell(row, index), o.decimalSeparator)
    let amountCents: number | null
    if (o.amountMode === 'DEBIT_CREDIT_COLUMNS') {
      const debit = cell(row, c.debit) === '' ? 0 : amount(c.debit)
      const credit = cell(row, c.credit) === '' ? 0 : amount(c.credit)
      amountCents = debit === null || credit === null || (debit === 0 && credit === 0) ? null : Math.abs(credit) - Math.abs(debit)
    } else if (o.amountMode === 'AMOUNT_WITH_DC_FLAG') {
      const value = amount(c.amount)
      const flag = cell(row, c.dcFlag)
      amountCents = value === null ? null : debitFlags.has(normalise(flag) || flag) ? -Math.abs(value) : Math.abs(value)
    } else {
      amountCents = amount(c.amount)
    }
    // The fee is charged on top: a €10 payment with a €0,50 fee leaves €10,50
    if (amountCents !== null && x.fee !== undefined && cell(row, x.fee) !== '') {
      const fee = amount(x.fee)
      amountCents = fee === null ? null : amountCents - Math.abs(fee)
    }
    if (amountCents !== null && o.invertSign) amountCents = -amountCents

    const bookedAt = parseStatementDate(dateText, o.dateOrder)
    const rowCurrency = cell(row, x.currency).toUpperCase()
    const foreign = rowCurrency !== '' && rowCurrency !== currency.toUpperCase()
    const valueText = cell(row, c.valueDate)
    const balanceText = cell(row, c.balance)
    out.push({
      line: r + 1,
      bookedAt,
      valueDate: valueText ? parseStatementDate(valueText, o.dateOrder) : null,
      amountCents,
      description: [cell(row, c.description), cell(row, x.detail)].filter(Boolean).join(' ').replace(/\s+/g, ' '),
      bankReference: cell(row, c.reference) || null,
      // A balance in another currency says nothing about this account
      balanceAfterCents: balanceText && !foreign ? parseStatementAmount(balanceText, o.decimalSeparator) : null,
      ...(bookedAt === null ? { problem: 'DATE' as const }
        : foreign ? { problem: 'CURRENCY' as const }
          : amountCents === null || amountCents === 0 ? { problem: 'AMOUNT' as const } : {}),
    })
  }
  return out
}
