/**
 * Month and week grids for calendars. Days are 'yyyy-MM-dd' strings, months 'yyyy-MM'.
 * The first day of the week is a household setting (AppSettings.weekStartsOn).
 */
import { addDays, addMonths } from './date-only'

/** 1 = Monday (the Greek norm), 0 = Sunday */
export type WeekStart = 0 | 1

export const WEEK_STARTS: WeekStart[] = [1, 0]
export const DEFAULT_WEEK_START: WeekStart = 1

export function isWeekStart(value: unknown): value is WeekStart {
  return value === 0 || value === 1
}

/** Day of the week, 0 = Sunday … 6 = Saturday */
export function weekday(day: string): number {
  return new Date(`${day}T00:00:00.000Z`).getUTCDay()
}

/** The first day of the week holding `day` */
export function weekStart(day: string, firstDay: WeekStart = DEFAULT_WEEK_START): string {
  return addDays(day, -((weekday(day) - firstDay + 7) % 7))
}

/** 'yyyy-MM' of a day */
export const monthOf = (day: string): string => day.slice(0, 7)

/** Last day of a month */
export function monthEnd(month: string): string {
  return addDays(`${addMonths(month, 1)}-01`, -1)
}

/** Weeks covering a month, 7 days each, starting on `firstDay` (4 to 6 weeks) */
export function monthWeeks(month: string, firstDay: WeekStart = DEFAULT_WEEK_START): string[][] {
  const last = monthEnd(month)
  const weeks: string[][] = []
  for (let start = weekStart(`${month}-01`, firstDay); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)))
  }
  return weeks
}

/** Short weekday names in the given language, starting on `firstDay` */
export function weekdayNames(lang: string, firstDay: WeekStart = DEFAULT_WEEK_START, style: 'short' | 'long' = 'short'): string[] {
  const format = new Intl.DateTimeFormat(lang, { weekday: style, timeZone: 'UTC' })
  // 2024-01-07 was a Sunday
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2024, 0, 7 + firstDay + i))))
}
