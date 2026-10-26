import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PDFDocument } from 'pdf-lib'

vi.mock('electron', () => ({ app: { isPackaged: false } }))

import { generateReportPdf, type PdfFonts } from '../services/pdf/report-pdf'
import type { ReportDocument } from '../../shared/report-document'

const fontDir = join(__dirname, '../../../resources/fonts')
const fonts: PdfFonts = {
  regular: readFileSync(join(fontDir, 'DejaVuSans.ttf')),
  bold: readFileSync(join(fontDir, 'DejaVuSans-Bold.ttf')),
}

const report = (rows: number, writeIn = false): ReportDocument => ({
  title: 'Προϋπολογισμός · Οκτώβριος 2026',
  subtitle: 'Φύλλο μηνιαίου προϋπολογισμού',
  writeIn,
  sections: [{
    heading: 'Έξοδα',
    columns: [{ header: 'Κατηγορία', width: 46 }, { header: 'Πρόβλεψη', width: 18, align: 'right' }],
    rows: Array.from({ length: rows }, (_, i) => ({ cells: [`Σούπερ μάρκετ ${i}`, '1.234,56 €'] })),
  }],
  footnote: 'Διαφορά = πρόβλεψη − πραγματικό.',
})

async function pageCount(buffer: Buffer): Promise<number> {
  return (await PDFDocument.load(buffer)).getPageCount()
}

describe('generateReportPdf', () => {
  it('draws Greek text and money on one A4 portrait page', async () => {
    const buffer = await generateReportPdf(report(10), fonts)
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    const doc = await PDFDocument.load(buffer)
    expect(doc.getPageCount()).toBe(1)
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595)
    expect(doc.getTitle()).toBe('Προϋπολογισμός · Οκτώβριος 2026')
  })

  it('breaks long tables onto more pages, and tall write-in rows sooner', async () => {
    expect(await pageCount(await generateReportPdf(report(80), fonts))).toBeGreaterThan(1)
    const plain = await pageCount(await generateReportPdf(report(40), fonts))
    const writeIn = await pageCount(await generateReportPdf(report(40, true), fonts))
    expect(writeIn).toBeGreaterThan(plain)
  })

  it('turns landscape pages sideways', async () => {
    const doc = await PDFDocument.load(await generateReportPdf({ ...report(3), orientation: 'landscape' }, fonts))
    expect(doc.getPage(0).getWidth()).toBeGreaterThan(doc.getPage(0).getHeight())
  })

  it('rejects a malformed document with INVALID_REPORT', async () => {
    await expect(generateReportPdf({ title: '', sections: [] }, fonts)).rejects.toThrow('INVALID_REPORT')
    await expect(generateReportPdf(null, fonts)).rejects.toThrow('INVALID_REPORT')
  })
})
