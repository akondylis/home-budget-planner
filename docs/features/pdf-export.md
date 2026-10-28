# PDF export with preview

**User's job:** get a sheet on paper (today to plan the month by hand, later to keep or share a statement) and
see exactly what will be printed before saving it.

## UX

- **Entry points:** Overview › **Print worksheet** (a secondary button; the page's primary action is kept for
  "Add expense"), or `Ctrl+K` → "print".
- **Preview first.** A page-size dialog shows the sheet as it will print, on white paper in both themes.
- **Footer:** month (this / next) · sheet language (ΕΛ / EN, defaults to the app's) · Close · **Export PDF**
  (primary). The preview updates instantly.
- **After saving:** a green notice with the file path and **Open**. Cancelling the save dialog changes nothing.
  Errors show in plain language (`error.PDF_EXPORT_FAILED`: choose another folder or close the open file).

## The first report: monthly budget worksheet

Portrait A4 with tall ruled rows to write on: Income (2 categories + 2 blank + total), Expenses (14 starter
categories + 2 blank + total), Summary (totals and what is left over), and a footnote explaining
*Difference = planned − actual*. Overview and `Ctrl+K` print it blank. The Budget page's **Print** fills it from
the month (`buildBudgetStatement`): the household's groups and categories with planned (with carry), actual and
difference, totals and what is left over ([budget](budget.md)).

## How it works

- A report is a `ReportDocument` (`src/shared/report-document.ts`, zod): title, context line, orientation,
  `writeIn`, sections of columns and rows of display strings, and a footnote. Money goes through `formatMoney()` and
  dates through `formatDate()` **before** they reach the document.
- The renderer builds it, because it has the translations; `i18next.getFixedT(lang)` gives the sheet language.
  `ReportPaper` draws it as HTML and main draws the same document with pdf-lib, so the preview and the PDF agree.
- Main validates the document (`INVALID_REPORT`), embeds DejaVu Sans (Greek glyphs, subset) from
  `resources/fonts`, repeats the table header after page breaks and numbers the pages.

## New report checklist

1. A pure builder in `lib/` that returns a `ReportDocument`, with a test that it passes `reportDocumentSchema`.
2. A small wrapper around `ReportPreviewModal` with any extra footer options.
3. An entry point on the page it belongs to, plus a palette command.

## Code

| Path | Role |
| --- | --- |
| `src/main/services/pdf/report-pdf.ts` | `generateReportPdf` |
| `src/main/services/pdf/pdf-export.ts` | Save dialog and write; open the saved file |
| `src/main/ipc/pdf.ts` | Thin handlers |
| `src/renderer/src/components/pdf/` | `ReportPreviewModal`, `ReportPaper`, `WorksheetPreviewModal` |
| `src/renderer/src/lib/budget-worksheet.ts` | Worksheet builder, blank or filled from a budget |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `pdf:export` | `(report, fileName, dialogTitle)` → `{ success: false }` or `{ success: true, filePath }` | `INVALID_REPORT`, `PDF_EXPORT_FAILED` |
| `shell:openFile` | `(filePath)`, `.pdf` only → `void` | `OPEN_FILE_FAILED` |

## Tests

`src/main/__tests__/report-pdf.test.ts` (Greek text, A4, page breaks, landscape, invalid input) and
`lib/budget-worksheet.test.ts`.
