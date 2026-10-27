// A small RFC 4180 reader: quoted cells, "" for a quote, line breaks inside
// quotes, CRLF/LF/CR endings. The separator is sniffed: Greek exports use ';'
// because ',' is the decimal mark.

export type Delimiter = ';' | ',' | '\t'

const DELIMITERS: Delimiter[] = [';', '\t', ',']

/** Counts each separator outside quotes on the first lines; the most frequent wins (';' on a tie) */
export function sniffDelimiter(text: string): Delimiter {
  const sample = text.split(/\r\n|\n|\r/).filter(l => l.trim() !== '').slice(0, 20)
  const score = (d: Delimiter) => sample.reduce((sum, line) => {
    let inQuotes = false
    let n = 0
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes
      else if (ch === d && !inQuotes) n++
    }
    return sum + n
  }, 0)
  return DELIMITERS.reduce((best, d) => (score(d) > score(best) ? d : best), DELIMITERS[0])
}

/** Rows of cells, with empty lines dropped */
export function parseCsv(text: string, delimiter: Delimiter = sniffDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    if (row.some(c => c.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
    } else if (ch === '"' && cell.trim() === '') {
      cell = ''
      inQuotes = true
    } else if (ch === delimiter) {
      endCell()
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRow()
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}
