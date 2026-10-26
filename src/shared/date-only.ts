// Calendar dates without a time (booked dates, opening dates), passed around as
// 'yyyy-MM-dd'. Stored as 12:00 UTC so the same day shows in every time zone
// from UTC−11 to UTC+11, and month ranges can be computed in UTC.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH = /^(\d{4})-(\d{2})$/

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = value.match(DATE_ONLY)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/** 'yyyy-MM-dd' → Date at 12:00 UTC; throws INVALID_DATE for anything else */
export function dateOnlyToDate(value: string): Date {
  if (!isDateOnly(value)) throw new Error('INVALID_DATE')
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

/** Date stored by dateOnlyToDate → 'yyyy-MM-dd' */
export function dateToDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Today in local time as 'yyyy-MM-dd' */
export function todayDateOnly(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function isMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = value.match(MONTH)
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12
}

/** 'yyyy-MM' → [first day 00:00 UTC, first day of next month 00:00 UTC) */
export function monthRange(month: string): { gte: Date; lt: Date } {
  if (!isMonth(month)) throw new Error('INVALID_DATE')
  const [y, m] = month.split('-').map(Number)
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) }
}

/** 'yyyy-MM' moved by `delta` months */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
