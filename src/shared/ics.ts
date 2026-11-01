/**
 * iCalendar (.ics, RFC 5545) export of the payment calendar: one all-day VEVENT per due
 * date, with an optional reminder. Texts arrive translated from the renderer; the main
 * process only writes the file. UIDs are stable, so importing again updates the entries.
 * Ported from Matchday (`chess-board/src/shared/ics.ts`).
 */

export interface IcsEntry {
  /** Stable identity, e.g. `<ruleId>-<dueDate>`; becomes `<uid>@home-budget` */
  uid: string
  /** 'yyyy-MM-dd' */
  day: string
  summary: string
  description?: string | null
  /** Remind this many days before (0 = on the day); none = no reminder */
  remindDays?: number | null
}

const MAX_LINE_OCTETS = 75
/** Reminders go off at 09:00 local time */
const REMIND_HOUR = 9

/** Escapes TEXT values: backslash, semicolon, comma and line breaks */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Folds a content line at 75 octets (UTF-8), never splitting a character */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let octets = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // Continuation lines start with a space, which counts toward their 75 octets
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1
    if (octets + size > limit) {
      parts.push(current)
      current = ''
      octets = 0
    }
    current += char
    octets += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const compactDay = (day: string) => day.replace(/-/g, '')

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Trigger before an all-day start (midnight): N days before at REMIND_HOUR */
function alarmTrigger(days: number): string {
  if (days <= 0) return `PT${REMIND_HOUR}H`
  const hours = 24 - REMIND_HOUR
  return `-P${days - 1}DT${hours}H`.replace('-P0DT', '-PT')
}

export function isIcsEntry(value: unknown): value is IcsEntry {
  const e = value as IcsEntry
  return !!e && typeof e.uid === 'string' && e.uid.length > 0 && typeof e.summary === 'string'
    && typeof e.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.day)
    && (e.remindDays == null || (Number.isInteger(e.remindDays) && e.remindDays >= 0))
}

/** The whole .ics file, CRLF line endings; `now` stamps DTSTAMP */
export function toIcs(entries: IcsEntry[], calendarName: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Home Budget//Payment calendar//EL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ]
  for (const e of entries) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@home-budget`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDay(e.day)}`,
      `DTEND;VALUE=DATE:${compactDay(nextDay(e.day))}`,
      `SUMMARY:${escapeIcsText(e.summary)}`,
      'TRANSP:TRANSPARENT',
    )
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`)
    if (e.remindDays != null) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeIcsText(e.summary)}`, `TRIGGER:${alarmTrigger(e.remindDays)}`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}
