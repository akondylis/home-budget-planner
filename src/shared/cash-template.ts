// The CSV template the household fills in for a Cash account, read back by the
// 'cash-template' preset (src/main/services/import/profiles.ts): Date, Description,
// Expense, Income, Category. Header only, so no example row is ever imported by mistake.

import { toCsv } from './reports'

/** Column headers per app language; the import reads either set (and the columns by position) */
export const CASH_TEMPLATE_HEADERS = {
  el: ['Ημερομηνία', 'Περιγραφή', 'Έξοδο', 'Έσοδο', 'Κατηγορία'],
  en: ['Date', 'Description', 'Expense', 'Income', 'Category'],
} as const

/** UTF-8 with BOM, ';' between cells: Greek Excel and LibreOffice open it straight into columns */
export function cashTemplateCsv(lang: string): string {
  const headers = lang.startsWith('en') ? CASH_TEMPLATE_HEADERS.en : CASH_TEMPLATE_HEADERS.el
  return toCsv([[...headers]])
}
