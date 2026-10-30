// Reports: types shared by main and renderer, the period maths and the CSV writer.
// Amounts are integer cents. Transfers never count; spending is positive.

import { addDays, addMonths, isDateOnly } from './date-only'

/** Period bar presets (decided 2026-10-30: presets + custom) */
export const PERIOD_PRESETS = ['THIS_MONTH', 'LAST_MONTH', 'THIS_YEAR', 'LAST_12', 'LAST_YEAR', 'CUSTOM'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

/** What Category and Member compare with */
export const COMPARE_MODES = ['NONE', 'PREVIOUS', 'LAST_YEAR'] as const
export type CompareMode = (typeof COMPARE_MODES)[number]

/** Both days included, 'yyyy-MM-dd' */
export interface DateRange {
  from: string
  to: string
}

/** Longer than this many months, Month by month groups by quarter */
export const MAX_TREND_COLUMNS = 24

const lastDayOf = (month: string): string => addDays(`${addMonths(month, 1)}-01`, -1)

/**
 * The days a preset covers on `today` ('yyyy-MM-dd'); CUSTOM has none of its own. Periods that
 * include today end today, so "same period last year" compares the same days, not a whole year.
 */
export function presetRange(preset: Exclude<PeriodPreset, 'CUSTOM'>, today: string): DateRange {
  const month = today.slice(0, 7)
  const year = Number(today.slice(0, 4))
  switch (preset) {
    case 'THIS_MONTH': return { from: `${month}-01`, to: today }
    case 'LAST_MONTH': return { from: `${addMonths(month, -1)}-01`, to: lastDayOf(addMonths(month, -1)) }
    case 'THIS_YEAR': return { from: `${year}-01-01`, to: today }
    case 'LAST_12': return { from: `${addMonths(month, -11)}-01`, to: today }
    case 'LAST_YEAR': return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
  }
}

export function isRange(r: unknown): r is DateRange {
  const v = r as DateRange
  return !!v && isDateOnly(v.from) && isDateOnly(v.to) && v.from <= v.to
}

/** Whole days in a range, both ends included */
export function rangeDays(r: DateRange): number {
  return Math.round((Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000) + 1
}

/** The same number of days just before */
export function previousRange(r: DateRange): DateRange {
  const to = addDays(r.from, -1)
  return { from: addDays(to, -(rangeDays(r) - 1)), to }
}

/** A date one year earlier; 29 Feb becomes 28 Feb */
const yearEarlier = (d: string): string => (d.endsWith('-02-29') ? `${Number(d.slice(0, 4)) - 1}-02-28` : `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`)

/** The same dates a year earlier */
export function lastYearRange(r: DateRange): DateRange {
  return { from: yearEarlier(r.from), to: yearEarlier(r.to) }
}

export function compareRangeFor(mode: CompareMode, r: DateRange): DateRange | null {
  return mode === 'PREVIOUS' ? previousRange(r) : mode === 'LAST_YEAR' ? lastYearRange(r) : null
}

/** 'yyyy-MM' months a range touches, oldest first */
export function monthsIn(r: DateRange): string[] {
  const out: string[] = []
  for (let m = r.from.slice(0, 7); m <= r.to.slice(0, 7); m = addMonths(m, 1)) out.push(m)
  return out
}

/** "2026-Q3" for a 'yyyy-MM' month */
export const quarterOf = (month: string): string => `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}`

// ── Report shapes ────────────────────────────────────────────────────────────

export type CategoryDirection = 'OUT' | 'IN'
export type CategoryLevel = 'CATEGORY' | 'GROUP'

export interface CategoryReportRow {
  /** null = rows with no category */
  id: string | null
  name: string
  /** The group of a category; null for a group or no category */
  groupName: string | null
  /** Positive: spending for OUT, income for IN */
  cents: number
  /** Same for the compared period; null without a comparison */
  compareCents: number | null
}

export interface CategoryReport {
  range: DateRange
  compare: DateRange | null
  direction: CategoryDirection
  level: CategoryLevel
  /** Largest first */
  rows: CategoryReportRow[]
  totalCents: number
  compareTotalCents: number | null
}

export interface TrendRow {
  /** 'yyyy-MM', or 'yyyy-Qn' when grouped by quarter */
  key: string
  range: DateRange
  inCents: number
  outCents: number
  /** in − out */
  netCents: number
  count: number
}

export interface TrendReport {
  range: DateRange
  by: 'MONTH' | 'QUARTER'
  rows: TrendRow[]
}

export interface MemberReportRow {
  /** A member id, or HOUSEHOLD for rows that are for no one parent */
  id: string
  name: string | null
  colour: string | null
  cents: number
  compareCents: number | null
  /** Largest categories of this member's spending, at most 5 */
  top: Array<{ id: string | null; name: string; cents: number }>
}

export interface MemberReport {
  range: DateRange
  compare: DateRange | null
  rows: MemberReportRow[]
  totalCents: number
  compareTotalCents: number | null
}

export interface BalanceAccountRow {
  id: string
  name: string
  /** Meal vouchers are listed apart and left out of the total */
  spendable: boolean
  archived: boolean
  startCents: number
  endCents: number
}

export interface BalanceReport {
  range: DateRange
  /** Spendable total the day before the period starts */
  startCents: number
  /** Spendable total at each month end (or the period's last day) */
  points: Array<{ month: string; cents: number }>
  accounts: BalanceAccountRow[]
}

/** Rows of a month list grouped into quarters, sums added */
export function groupByQuarter(rows: TrendRow[]): TrendRow[] {
  const out: TrendRow[] = []
  for (const r of rows) {
    const key = quarterOf(r.key)
    const last = out.at(-1)
    if (last && last.key === key) {
      last.inCents += r.inCents
      last.outCents += r.outCents
      last.netCents += r.netCents
      last.count += r.count
      last.range = { from: last.range.from, to: r.range.to }
    } else {
      out.push({ ...r, key, range: { ...r.range } })
    }
  }
  return out
}

/** Largest first, then by name; ties never reorder between loads */
export function rankRows<T extends { cents: number; name: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.cents - a.cents || (a.name ?? '').localeCompare(b.name ?? ''))
}

/** Share of a total as a whole percentage (0 when the total is 0) */
export const sharePercent = (cents: number, totalCents: number): number => (totalCents > 0 ? Math.round((cents * 100) / totalCents) : 0)

// ── CSV ──────────────────────────────────────────────────────────────────────

/** An amount for a spreadsheet: no currency, no grouping, the app language's decimal mark ("1234,56" in Greek) */
export function csvMoney(cents: number, lang: string): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const text = `${Math.floor(abs / 100)}${lang === 'en' ? '.' : ','}${String(abs % 100).padStart(2, '0')}`
  return sign + text
}

const quote = (cell: string): string => (/[";\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)

/** CSV that Excel opens in Greek or English: UTF-8 BOM, `;` between cells, CRLF lines */
export function toCsv(rows: Array<Array<string | number | null>>): string {
  return '﻿' + rows.map(r => r.map(c => quote(c === null ? '' : String(c))).join(';')).join('\r\n') + '\r\n'
}
