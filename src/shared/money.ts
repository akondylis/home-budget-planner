// Money is stored and computed as integer minor units (cents) — never floats.
// Shared by renderer and main (exports, reports), so totals match everywhere.

export const DEFAULT_CURRENCY = 'EUR'

let currentLocale = 'el-GR'

/** Sets the language for number formatting ('el' → 1.234,56 €, anything else → €1,234.56). */
export function setMoneyLanguage(lang: string | null | undefined): void {
  currentLocale = lang?.startsWith('en') ? 'en-IE' : 'el-GR'
}

const formatters = new Map<string, Intl.NumberFormat>()

function formatterFor(currency: string, signDisplay: 'auto' | 'always' | 'exceptZero'): Intl.NumberFormat {
  const key = `${currentLocale}|${currency}|${signDisplay}`
  let fmt = formatters.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(currentLocale, { style: 'currency', currency, signDisplay })
    formatters.set(key, fmt)
  }
  return fmt
}

/** Minor units of the currency (2 for EUR); the divisor between cents and units. */
function minorDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

export interface FormatMoneyOptions {
  currency?: string
  /** 'always' shows +/− (cash-flow columns); 'auto' only − */
  sign?: 'auto' | 'always' | 'exceptZero'
}

/** Integer cents → display text in the app language, e.g. 123456 → "1.234,56 €". '' for missing input. */
export function formatMoney(cents: number | null | undefined, opts: FormatMoneyOptions = {}): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return ''
  const currency = opts.currency ?? DEFAULT_CURRENCY
  return formatterFor(currency, opts.sign ?? 'auto').format(cents / 10 ** minorDigits(currency))
}

/**
 * User input → integer cents; accepts "1234,5", "1.234,56", "1,234.56", "-12". null when not a number.
 * The last '.' or ',' followed by 1–2 digits is the decimal separator; other separators are grouping.
 */
export function parseMoney(input: string, currency: string = DEFAULT_CURRENCY): number | null {
  const text = input.trim().replace(/[\s€$£]/g, '')
  if (!/^[-+]?[\d.,]+$/.test(text) || !/\d/.test(text)) return null
  const negative = text.startsWith('-')
  const body = text.replace(/^[-+]/, '')
  const match = body.match(/^(.*?)[.,](\d{1,2})$/)
  const whole = (match ? match[1] : body).replace(/[.,]/g, '')
  const fraction = match ? match[2].padEnd(2, '0') : '00'
  if (whole !== '' && !/^\d+$/.test(whole)) return null
  const digits = minorDigits(currency)
  const cents = Number(whole || '0') * 10 ** digits + Number(fraction.slice(0, digits).padEnd(digits, '0'))
  return negative ? -cents : cents
}

/** Sum of integer cents; exact, unlike summing float amounts. */
export function sumMoney(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, v) => total + (v ?? 0), 0)
}
