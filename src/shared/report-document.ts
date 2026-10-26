// A printable report: a title, a context line and sections of simple tables.
// Built in the renderer (it has the translations), previewed as HTML by ReportPaper
// and drawn to PDF by src/main/services/pdf/report-pdf.ts, so both show the same thing.
// Cells are display strings: money goes through formatMoney(), dates through formatDate().

import { z } from 'zod'

export const reportColumnSchema = z.object({
  header: z.string(),
  /** Relative width; scaled to the page */
  width: z.number().positive(),
  align: z.enum(['left', 'center', 'right']).optional(),
})

export const reportRowSchema = z.object({
  cells: z.array(z.string()),
  bold: z.boolean().optional(),
})

export const reportSectionSchema = z.object({
  heading: z.string().optional(),
  columns: z.array(reportColumnSchema).min(1),
  rows: z.array(reportRowSchema),
})

export const reportDocumentSchema = z.object({
  title: z.string().min(1),
  /** Context line under the title: month · household · … */
  subtitle: z.string().optional(),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  /** Tall rows with a rule under each, for filling in by hand */
  writeIn: z.boolean().default(false),
  /** Small print at the end, e.g. how to use a worksheet */
  footnote: z.string().optional(),
  sections: z.array(reportSectionSchema).min(1),
})

export type ReportColumn = z.infer<typeof reportColumnSchema>
export type ReportRow = z.infer<typeof reportRowSchema>
export type ReportSection = z.infer<typeof reportSectionSchema>
export type ReportDocument = z.input<typeof reportDocumentSchema>

/** Replaces the characters Windows does not allow in file names with '-' */
export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\|?*]/g, '-').trim()
}
