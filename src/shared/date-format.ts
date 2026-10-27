// Display formatting for dates, shared by renderer and main (PDF/Excel).
// The format is chosen in Settings (AppSettings.dateFormat) and set here at
// startup in each process, so output doesn't depend on the Chromium/OS locale.
// Month-name formats follow the app language.

export const DATE_FORMATS = [
  'dd/MM/yyyy',
  'dd-MM-yyyy',
  'dd.MM.yyyy',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
  'dd MMM yyyy',
  'dd MMMM yyyy',
] as const

export type DateFormat = (typeof DATE_FORMATS)[number]

export const DEFAULT_DATE_FORMAT: DateFormat = 'dd/MM/yyyy'

export function isDateFormat(value: unknown): value is DateFormat {
  return typeof value === 'string' && (DATE_FORMATS as readonly string[]).includes(value)
}

let currentFormat: DateFormat = DEFAULT_DATE_FORMAT
let currentLocale = 'el-GR'

/** Sets the format used by formatDate/formatDateTime; unknown values fall back to the default. */
export function setDateFormat(format: string | null | undefined): void {
  currentFormat = isDateFormat(format) ? format : DEFAULT_DATE_FORMAT
}

export function getDateFormat(): DateFormat {
  return currentFormat
}

/** Sets the language for month names ('el' → Greek, anything else → English). */
export function setDateLanguage(lang: string | null | undefined): void {
  currentLocale = lang?.startsWith('en') ? 'en-GB' : 'el-GR'
}

const pad = (n: number) => String(n).padStart(2, '0')

function toDate(value: string | number | Date): Date | null {
  // 'yyyy-MM-dd' is a calendar day: read it as local, not as UTC midnight
  const day = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatParts(d: Date, format: DateFormat): string {
  const dd = pad(d.getDate())
  const mm = pad(d.getMonth() + 1)
  const yyyy = String(d.getFullYear())
  switch (format) {
    case 'dd/MM/yyyy': return `${dd}/${mm}/${yyyy}`
    case 'dd-MM-yyyy': return `${dd}-${mm}-${yyyy}`
    case 'dd.MM.yyyy': return `${dd}.${mm}.${yyyy}`
    case 'MM/dd/yyyy': return `${mm}/${dd}/${yyyy}`
    case 'yyyy-MM-dd': return `${yyyy}-${mm}-${dd}`
    case 'dd MMM yyyy':
    case 'dd MMMM yyyy': {
      // Formatting day + month together gives the Greek genitive ("Μαρτίου")
      const month = new Intl.DateTimeFormat(currentLocale, {
        day: 'numeric',
        month: format === 'dd MMM yyyy' ? 'short' : 'long',
      })
        .formatToParts(d)
        .find((p) => p.type === 'month')?.value ?? mm
      return `${dd} ${month.replace(/\.$/, '')} ${yyyy}`
    }
  }
}

/** Date in the chosen format (local time); '' for missing or invalid input. */
export function formatDate(
  value: string | number | Date | null | undefined,
  format: DateFormat = currentFormat
): string {
  if (value === null || value === undefined || value === '') return ''
  const d = toDate(value)
  return d ? formatParts(d, format) : ''
}

// ── Typed input ──────────────────────────────────────────────────────────────

export type DateOrder = 'DMY' | 'MDY' | 'YMD'

/** Order in which a date is typed; month-name formats are typed as numbers, day first */
export function entryOrder(format: DateFormat = currentFormat): DateOrder {
  if (format === 'MM/dd/yyyy') return 'MDY'
  if (format === 'yyyy-MM-dd') return 'YMD'
  return 'DMY'
}

/** The numeric format a date is typed and shown in while editing */
export function entryFormat(format: DateFormat = currentFormat): DateFormat {
  return format === 'dd MMM yyyy' || format === 'dd MMMM yyyy' ? 'dd/MM/yyyy' : format
}

/**
 * Typed text → 'yyyy-MM-dd' in the order of the chosen format; null when it is not a real date.
 * Any of / - . or space separates the parts; a 2-digit year means 20yy, and a missing year
 * the year of `today` ("5/3" → 5 March this year, for DMY).
 */
export function parseDate(text: string, format: DateFormat = currentFormat, today: Date = new Date()): string | null {
  return parseDateInOrder(text, entryOrder(format), today)
}

/** As parseDate, with the order of the parts given directly (bank statements) */
export function parseDateInOrder(text: string, order: DateOrder, today: Date = new Date()): string | null {
  const parts = text.trim().split(/[\s/.\-]+/).filter(Boolean)
  if (parts.length < 2 || parts.length > 3 || !parts.every(p => /^\d+$/.test(p))) return null
  let y: string | undefined, m: string, d: string
  if (order === 'YMD') {
    if (parts.length !== 3) return null
    ;[y, m, d] = parts
  } else {
    ;[d, m, y] = order === 'DMY' ? parts : [parts[1], parts[0], parts[2]]
  }
  let year = y === undefined ? today.getFullYear() : Number(y)
  if (y !== undefined && y.length === 2) year += 2000
  else if (y !== undefined && y.length !== 4) return null
  const month = Number(m)
  const day = Number(d)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Date in the chosen format plus 'HH:mm' (24-hour), local time; '' for missing or invalid input. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const d = toDate(value)
  return d ? `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
}
