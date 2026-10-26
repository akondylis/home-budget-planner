import { readFileSync } from 'fs'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { getResourcePath } from '../resources'
import { drawText, fitText, wrapText } from './pdf-text'
import { reportDocumentSchema, type ReportColumn, type ReportRow } from '../../../shared/report-document'

/**
 * Draws a ReportDocument on A4: title and context line on every page, bold section
 * headings, tables whose header row repeats after a page break, page numbers.
 * Write-in documents get tall ruled rows so they can be filled in by hand.
 */

const A4 = { short: 595.28, long: 841.89 }
const MARGIN = 36
const ROW = 16
const WRITE_IN_ROW = 22
const TITLE_SIZE = 15
const TEXT = rgb(0.1, 0.1, 0.1)
const MUTED = rgb(0.4, 0.4, 0.4)
const RULE = rgb(0.75, 0.75, 0.75)
const HEADER_RULE = rgb(0.3, 0.3, 0.3)

export interface PdfFonts {
  regular: Uint8Array
  bold: Uint8Array
}

/** DejaVu Sans from resources/fonts (Greek glyphs) */
export function loadBundledFonts(): PdfFonts {
  return {
    regular: readFileSync(getResourcePath('fonts', 'DejaVuSans.ttf')),
    bold: readFileSync(getResourcePath('fonts', 'DejaVuSans-Bold.ttf')),
  }
}

class ReportPdf {
  private pages: PDFPage[] = []
  private page!: PDFPage
  private y = 0
  private readonly width: number
  private readonly height: number
  private readonly contentWidth: number

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
    private readonly title: string,
    private readonly subtitle: string | undefined,
    landscape: boolean,
    private readonly rowHeight: number,
    private readonly ruled: boolean,
  ) {
    this.width = landscape ? A4.long : A4.short
    this.height = landscape ? A4.short : A4.long
    this.contentWidth = this.width - 2 * MARGIN
    this.newPage()
  }

  private newPage(): void {
    this.page = this.doc.addPage([this.width, this.height])
    this.pages.push(this.page)
    let top = this.height - MARGIN - TITLE_SIZE
    this.page.drawText(fitText(this.title, this.contentWidth, this.bold, TITLE_SIZE), { x: MARGIN, y: top, size: TITLE_SIZE, font: this.bold, color: TEXT })
    if (this.subtitle) {
      top -= 16
      this.page.drawText(fitText(this.subtitle, this.contentWidth, this.font, 9), { x: MARGIN, y: top, size: 9, font: this.font, color: MUTED })
    }
    this.y = top - 12
  }

  /** Moves down by `height`, starting a page when it would not fit; true when a page was started */
  private advance(height: number): boolean {
    const broke = this.y - height < MARGIN + 14
    if (broke) this.newPage()
    this.y -= height
    return broke
  }

  /** A bold heading, kept with at least three rows of its table */
  heading(text: string): void {
    if (this.y - 24 - this.rowHeight * 3 < MARGIN + 14) this.newPage()
    this.y -= 10
    this.advance(14)
    this.page.drawText(fitText(text, this.contentWidth, this.bold, 11), { x: MARGIN, y: this.y + 3, size: 11, font: this.bold, color: TEXT })
  }

  table(columns: ReportColumn[], rows: ReportRow[]): void {
    const total = columns.reduce((sum, c) => sum + c.width, 0)
    const widths = columns.map(c => (c.width / total) * this.contentWidth)

    const drawRow = (cells: string[], font: PDFFont, h: number, color = TEXT) => {
      let x = MARGIN
      cells.forEach((value, i) => {
        drawText(this.page, font, value, { x, y: this.y, w: widths[i], h }, { size: 9, align: columns[i].align ?? 'left', shrink: true, color })
        x += widths[i]
      })
    }
    const rule = (color: ReturnType<typeof rgb>, thickness: number) =>
      this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + this.contentWidth, y: this.y }, thickness, color })
    const drawHeader = () => {
      this.advance(ROW)
      drawRow(columns.map(c => c.header), this.bold, ROW, MUTED)
      rule(HEADER_RULE, 0.75)
    }

    if (this.y - ROW - this.rowHeight * 2 < MARGIN + 14) this.newPage()
    drawHeader()
    for (const row of rows) {
      if (this.advance(this.rowHeight)) {
        this.y += this.rowHeight
        drawHeader()
        this.advance(this.rowHeight)
      }
      drawRow(row.cells, row.bold ? this.bold : this.font, this.rowHeight)
      if (this.ruled || row.bold) rule(row.bold ? HEADER_RULE : RULE, row.bold ? 0.75 : 0.5)
    }
    this.y -= 6
  }

  footnote(text: string): void {
    for (const line of wrapText(text, this.contentWidth, this.font, 8)) {
      this.advance(11)
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 8, font: this.font, color: MUTED })
    }
  }

  /** "1 / 3" at the foot of every page */
  numberPages(): void {
    const total = this.pages.length
    this.pages.forEach((page, i) => {
      const label = `${i + 1} / ${total}`
      page.drawText(label, { x: this.width - MARGIN - this.font.widthOfTextAtSize(label, 8), y: MARGIN - 14, size: 8, font: this.font, color: MUTED })
    })
  }
}

/** Validates the renderer's document and draws it. Throws: 'INVALID_REPORT' */
export async function generateReportPdf(input: unknown, fonts: PdfFonts = loadBundledFonts()): Promise<Buffer> {
  const parsed = reportDocumentSchema.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_REPORT')
  const report = parsed.data

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(report.title)
  const font = await doc.embedFont(fonts.regular, { subset: true })
  const bold = await doc.embedFont(fonts.bold, { subset: true })

  const pdf = new ReportPdf(
    doc, font, bold, report.title, report.subtitle,
    report.orientation === 'landscape',
    report.writeIn ? WRITE_IN_ROW : ROW,
    report.writeIn,
  )
  for (const section of report.sections) {
    if (section.heading) pdf.heading(section.heading)
    pdf.table(section.columns, section.rows)
  }
  if (report.footnote) pdf.footnote(report.footnote)
  pdf.numberPages()
  return Buffer.from(await doc.save())
}
