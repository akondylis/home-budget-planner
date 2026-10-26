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

/** Date in the chosen format plus 'HH:mm' (24-hour), local time; '' for missing or invalid input. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const d = toDate(value)
  return d ? `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
}
