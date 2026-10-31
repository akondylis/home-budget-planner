// Some banks save an HTML table with an .xls name (Viva Wallet's "Excel" export).
// Rows of <th>/<td> cells → the same string[][] a CSV gives; no HTML library needed
// for a flat table.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

/** The decoded text is a web page with a table, not delimited text */
export function isHtmlTable(text: string): boolean {
  const start = text.replace(/^﻿/, '').trimStart()
  return start.startsWith('<') && /<table[\s>]/i.test(text)
}

/** Every <tr> of the page as its cells' text: tags taken out, entities decoded, spaces collapsed */
export function readHtmlTable(text: string): string[][] {
  const body = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  const rows: string[][] = []
  for (const [, row] of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(([, cell]) =>
      decodeEntities(cell.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(),
    )
    rows.push(cells)
  }
  return rows
}
