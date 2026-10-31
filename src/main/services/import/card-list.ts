// Meal-card issuers (Up Hellas, Edenred) have no statement export, only their web page.
// The user pastes the copied list, or opens the page the browser saved (.mhtml / .html);
// either way the text is scanned line by line for "description, date, amount" and turned
// into the same three-column table a CSV would give.
//
// Shapes seen on the real pages (2026-10-31):
// - Up Hellas: "SKLAVENITIS31/10/2026" (date glued to the merchant), then "-97.25€" / "+130.00€"
// - Edenred: a month header glued to the first title ("Οκτώβριος 2026A2000 …"), the date on its own
//   line, "-15.70 €" or "130.00 €" (a top-up has no sign), and "Απορριφθείσα" after a declined payment's amount

import { decodeEntities } from './html-table'

export const CARD_LIST_HEADER = ['Date', 'Description', 'Amount']

const DATE_AT_END = /(\d{1,2}\/\d{1,2}\/\d{4})$/
// An amount on its own (a whole line), or after a space at the end of a line; "My Balance32,89€" is neither
const AMOUNT = String.raw`[+\-−]?\s?\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}\s?€?`
const AMOUNT_LINE = new RegExp(`^${AMOUNT}$`)
const AMOUNT_AT_END = new RegExp(`\\s(${AMOUNT})$`)
const DECLINED = /^(Απορριφθείσα|Απορρίφθηκε|Απορρίφθηκαν|Declined|Rejected)$/i
const MONTH_HEADER = new RegExp(
  '^(Ιανουάριος|Φεβρουάριος|Μάρτιος|Απρίλιος|Μάιος|Ιούνιος|Ιούλιος|Αύγουστος|Σεπτέμβριος|Οκτώβριος|Νοέμβριος|Δεκέμβριος|' +
    'January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}\\s*',
  'i',
)

type Token = { kind: 'text' | 'date' | 'amount'; value: string }

/** "-1.234,50 €" / "+130.00€" → "-1234.50" / "+130.00": the last separator before two digits is the decimal one */
export function normaliseCardAmount(text: string): string {
  const t = text.replace(/€/g, '').replace(/\s/g, '').replace('−', '-')
  const sign = t.startsWith('-') ? '-' : t.startsWith('+') ? '+' : ''
  const digits = t.replace(/^[+-]/, '')
  const whole = digits.slice(0, -3).replace(/[.,]/g, '')
  return `${sign}${whole}.${digits.slice(-2)}`
}

/** One line → its text, then a date glued or spaced at its end, then an amount at its end */
function tokens(line: string): Token[] {
  if (AMOUNT_LINE.test(line)) return [{ kind: 'amount', value: line }]
  let rest = line
  const out: Token[] = []
  const amount = rest.match(AMOUNT_AT_END)
  if (amount) {
    out.unshift({ kind: 'amount', value: amount[1] })
    rest = rest.slice(0, amount.index).trimEnd()
  }
  const date = rest.match(DATE_AT_END)
  if (date) {
    out.unshift({ kind: 'date', value: date[1] })
    rest = rest.slice(0, date.index).trimEnd()
  }
  // A date and amount with nothing before them could still be a stray amount on a junk line
  if (!date && amount) return [{ kind: 'text', value: line }]
  if (rest) out.unshift({ kind: 'text', value: rest })
  return out
}

/**
 * Pasted text (or a saved page's text) → header + one row per movement, and how many declined
 * payments were left out. A movement is the nearest text line before a date, the date, then an amount;
 * anything else on the page (balance, menus, cookie notices) is skipped.
 */
export function readCardList(text: string): { cells: string[][]; declined: number } {
  const lines = text.split(/\r?\n|\t/).map(l => l.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
  const rows: string[][] = []
  let declined = 0
  let description: string | null = null
  let date: string | null = null
  let lastWasAmount = false
  for (const token of lines.flatMap(tokens)) {
    if (token.kind === 'text') {
      if (lastWasAmount && rows.length > 0 && DECLINED.test(token.value)) {
        rows.pop()
        declined++
      } else {
        // A date with no amount after it was not a movement ("last updated 31/10/2026")
        const stripped = token.value.replace(MONTH_HEADER, '').trim()
        if (stripped) {
          description = stripped
          date = null
        }
      }
      lastWasAmount = false
    } else if (token.kind === 'date') {
      date = token.value
      lastWasAmount = false
    } else {
      if (date !== null) {
        rows.push([date, description ?? '', normaliseCardAmount(token.value)])
        description = null
        date = null
        lastWasAmount = true
      } else {
        lastWasAmount = false
      }
    }
  }
  return { cells: rows.length > 0 ? [CARD_LIST_HEADER, ...rows] : [], declined }
}

// ── Saved pages ──────────────────────────────────────────────────────────────

/** A page saved by the browser as one file (Chrome/Edge "Webpage, single file") */
export function isMhtml(text: string): boolean {
  const head = text.slice(0, 4000)
  return /^MIME-Version:/im.test(head) && /multipart\/related/i.test(head)
}

export function isHtmlPage(text: string): boolean {
  const start = text.replace(/^﻿/, '').trimStart()
  return start.startsWith('<') && /<(html|body|div)[\s>]/i.test(text)
}

function decodeQuotedPrintable(body: string): Uint8Array {
  const text = body.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      const code = text.charCodeAt(i)
      if (code < 0x80) bytes.push(code)
      else bytes.push(...new TextEncoder().encode(c))
    }
  }
  return new Uint8Array(bytes)
}

function decodeWith(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** The page's HTML part of an .mhtml file; '' when there is none */
export function mhtmlHtml(text: string): string {
  const boundary = text.match(/boundary="?([^";\r\n]+)"?/i)?.[1]
  if (!boundary) return ''
  for (const part of text.split(`--${boundary}`)) {
    const split = part.search(/\r?\n\r?\n/)
    if (split < 0) continue
    const headers = part.slice(0, split)
    if (!/Content-Type:\s*text\/html/i.test(headers)) continue
    const body = part.slice(split).replace(/^\r?\n\r?\n/, '')
    const charset = headers.match(/charset="?([^";\r\n]+)"?/i)?.[1] ?? 'utf-8'
    const encoding = headers.match(/Content-Transfer-Encoding:\s*([\w-]+)/i)?.[1]?.toLowerCase()
    if (encoding === 'quoted-printable') return decodeWith(decodeQuotedPrintable(body), charset)
    if (encoding === 'base64') return decodeWith(new Uint8Array(Buffer.from(body.replace(/\s/g, ''), 'base64')), charset)
    return body
  }
  return ''
}

/** A page's visible text, one block element per line, the way a browser copy gives it */
export function htmlText(html: string): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|noscript|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|li|p|tr|td|th|h[1-6]|ul|ol|table|section|article|header|footer|label|button|a)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return decodeEntities(body)
}
