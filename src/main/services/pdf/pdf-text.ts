import { rgb, type PDFFont, type PDFPage } from 'pdf-lib'

/** Inner padding of a drawn cell, in points */
export const CELL_PADDING = 2.5

const BLACK = rgb(0, 0, 0)

export interface Rect { x: number; y: number; w: number; h: number }
export interface TextOpts { size?: number; minSize?: number; align?: 'left' | 'center' | 'right'; color?: ReturnType<typeof rgb>; shrink?: boolean }

/** Truncates text with an ellipsis so it never exceeds maxWidth at the given font/size (prevents column overlap). */
export function fitText(text: string, maxWidth: number, font: PDFFont, size: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let truncated = text
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated + '…', size) > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '…'
}

/** Draws one line of text vertically centred in a cell; `shrink` lowers the size (down to minSize, 6pt) before truncating */
export function drawText(page: PDFPage, font: PDFFont, value: string, r: Rect, opts: TextOpts): void {
  if (!value) return
  const maxW = r.w - CELL_PADDING * 2
  if (maxW <= 0) return
  let size = opts.size ?? 8
  if (opts.shrink) {
    const minSize = opts.minSize ?? 6
    while (size > minSize && font.widthOfTextAtSize(value, size) > maxW) size -= 0.25
  }
  const t = fitText(value, maxW, font, size)
  const w = font.widthOfTextAtSize(t, size)
  const align = opts.align ?? 'left'
  const x = align === 'left' ? r.x + CELL_PADDING : align === 'right' ? r.x + r.w - CELL_PADDING - w : r.x + (r.w - w) / 2
  const y = r.y + (r.h - size * 0.72) / 2
  page.drawText(t, { x, y, size, font, color: opts.color ?? BLACK })
}

/** Greedy word wrap honouring explicit line breaks; over-long words are truncated */
export function wrapText(value: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const out: string[] = []
  for (const para of value.split(/\r?\n/)) {
    let current = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next
      } else {
        if (current) out.push(current)
        current = fitText(word, maxWidth, font, size)
      }
    }
    out.push(current)
  }
  return out
}

/**
 * Wraps into at most maxLines, lowering the size (0.25 steps, down to minSize) until it fits;
 * whatever still overflows is joined onto the last line for drawText to shrink/truncate
 */
export function wrapToLines(value: string, maxWidth: number, font: PDFFont, size: number, minSize: number, maxLines: number): { lines: string[]; size: number } {
  let s = size
  let lines = wrapText(value, maxWidth, font, s)
  while (lines.length > maxLines && s > minSize) {
    s -= 0.25
    lines = wrapText(value, maxWidth, font, s)
  }
  if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')]
  return { lines, size: s }
}
