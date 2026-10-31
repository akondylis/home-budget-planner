// Excel (.xlsx) statement → rows of cells, for banks that export no CSV (Piraeus).
//
// An .xlsx is a zip of XML parts. Only what a statement needs is read: the first
// sheet, its shared strings, and which cell styles are dates. Numbers and dates keep
// their value until the bank's preset says how to write them out (decimal mark,
// date order), so the same row parsing works as for CSV. No dependency: zip entries
// are inflated with Node's zlib.

import { inflateRawSync } from 'node:zlib'
import type { DateOrder, DecimalSeparator } from '../../../shared/statement-import'

export type SheetCell = { text: string } | { number: number } | { date: string }

/** Cells by row and column, both 0-based as in Excel (row 7 in Excel is index 6) */
export type Sheet = SheetCell[][]

/** A zip file starts with a local file header */
export function isXlsx(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

// ── Zip ──────────────────────────────────────────────────────────────────────

const MAX_PART_BYTES = 50 * 1024 * 1024

/** Every entry of a zip by name, inflated on demand. Throws on a broken zip. */
function readZip(bytes: Uint8Array): Map<string, () => Buffer> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // End of central directory: the last 0x06054b50, within the 64 KB comment limit
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('NOT_A_ZIP')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries = new Map<string, () => Buffer>()
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('NOT_A_ZIP')
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLength = buf.readUInt16LE(p + 28)
    const skip = nameLength + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength)
    entries.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
      const data = buf.subarray(start, start + size)
      if (method === 0) return data
      if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES })
      throw new Error('NOT_A_ZIP')
    })
    p += 46 + skip
  }
  return entries
}

// ── XML bits ─────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

/** XML text → string: entities, then Excel's _xHHHH_ escapes (e.g. _x000D_ for a carriage return) */
function xmlText(raw: string): string {
  return raw
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m))
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

/** The text of every <t> inside a fragment (rich text runs joined; phonetic hints left out) */
const joinedText = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => xmlText(m[1])).join('')

// ── Workbook parts ───────────────────────────────────────────────────────────

function firstSheetPath(zip: Map<string, () => Buffer>): string {
  const workbook = zip.get('xl/workbook.xml')?.().toString('utf8') ?? ''
  const rels = zip.get('xl/_rels/workbook.xml.rels')?.().toString('utf8') ?? ''
  const sheetTag = /<sheet\b[^>]*>/.exec(workbook)?.[0]
  const relId = sheetTag ? attr(sheetTag, 'r:id') : undefined
  const relTag = relId ? [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(t => attr(t, 'Id') === relId) : undefined
  const target = relTag ? attr(relTag, 'Target') : undefined
  if (!target) return 'xl/worksheets/sheet1.xml'
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`
}

// Built-in number formats that show a date (14–22: d/m/y, with or without a time)
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22])

/** For each cell style index, whether it shows a date */
function dateStyles(stylesXml: string): boolean[] {
  const custom = new Map<number, string>()
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) custom.set(Number(attr(m[0], 'numFmtId')), xmlText(attr(m[0], 'formatCode') ?? ''))
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? ''
  return [...cellXfs.matchAll(/<xf\b[^>]*>/g)].map(m => {
    const id = Number(attr(m[0], 'numFmtId') ?? 0)
    if (BUILTIN_DATE_FORMATS.has(id)) return true
    // A custom format with day or year parts; quoted text and [colour/locale] blocks left out
    const code = custom.get(id)?.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '') ?? ''
    return /[dy]/i.test(code)
  })
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Excel's day number → 'yyyy-MM-dd' (the 1900 system counts a 29 Feb 1900 that never was; day 61 on is right) */
function serialToDate(serial: number, date1904: boolean): string {
  const ms = Date.UTC(1899, 11, 30) + (Math.floor(serial) + (date1904 ? 1462 : 0)) * 86_400_000
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** "AB12" → 27 (0-based column) */
function columnIndex(ref: string): number {
  let n = 0
  for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? '') n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

/** The first sheet of an .xlsx. Throws 'IMPORT_FILE_UNREADABLE' when the file is not a readable workbook. */
export function readXlsx(bytes: Uint8Array): Sheet {
  try {
    const zip = readZip(bytes)
    const part = (name: string) => zip.get(name)?.().toString('utf8') ?? ''
    const sheetXml = part(firstSheetPath(zip))
    if (!sheetXml) throw new Error('NO_SHEET')
    const shared = [...part('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => joinedText(m[1]))
    const isDate = dateStyles(part('xl/styles.xml'))
    const date1904 = /<workbookPr\b[^>]*\sdate1904="(1|true)"/.test(part('xl/workbook.xml'))

    const sheet: Sheet = []
    for (const row of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(attr(row[1], 'r') ?? sheet.length + 1) - 1
      const cells: SheetCell[] = []
      for (const c of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], 'r')
        const col = ref ? columnIndex(ref) : cells.length
        const type = attr(c[1], 't')
        const body = c[2] ?? ''
        const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        let cell: SheetCell = { text: '' }
        if (type === 's' && value !== undefined) cell = { text: shared[Number(value)] ?? '' }
        else if (type === 'inlineStr') cell = { text: joinedText(body) }
        else if ((type === 'str' || type === 'b') && value !== undefined) cell = { text: xmlText(value) }
        else if ((type === undefined || type === 'n') && value !== undefined && value.trim() !== '') {
          const n = Number(value)
          if (Number.isFinite(n)) cell = isDate[Number(attr(c[1], 's') ?? 0)] ? { date: serialToDate(n, date1904) } : { number: n }
        }
        cells[col] = cell
      }
      sheet[r] = Array.from(cells, c => c ?? { text: '' })
    }
    return Array.from(sheet, row => row ?? [])
  } catch {
    throw new Error('IMPORT_FILE_UNREADABLE')
  }
}

// ── Cells → text in the bank's style ─────────────────────────────────────────

/** A number as plain text with the given decimal mark: money with 2 decimals, whole numbers (references) as they are */
function numberText(n: number, decimal: DecimalSeparator): string {
  let text: string
  if (Number.isInteger(n)) text = n.toFixed(0)
  else if (Math.abs(n * 100 - Math.round(n * 100)) < 1e-6) text = n.toFixed(2)
  else text = String(n)
  return decimal === ',' ? text.replace('.', ',') : text
}

function dateText(iso: string, order: DateOrder): string {
  const [y, m, d] = iso.split('-')
  return order === 'YMD' ? iso : order === 'DMY' ? `${d}/${m}/${y}` : `${m}/${d}/${y}`
}

/** The sheet as text rows, numbers and dates written the way the preset reads them */
export function sheetRows(sheet: Sheet, style: { decimalSeparator: DecimalSeparator; dateOrder: DateOrder }): string[][] {
  return sheet.map(row =>
    row.map(c => ('text' in c ? c.text : 'number' in c ? numberText(c.number, style.decimalSeparator) : dateText(c.date, style.dateOrder))))
}
