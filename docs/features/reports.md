# Reports & stats

**User's job:** "Where did our money go, and is it getting better?" Pick a period once; each tab answers one
question, and any row opens the transactions behind it. Starts from **Reports** in the sidebar (also `Ctrl+K`).

## UX

- **Header:** "Reports" with the context line (`01/01/2026 – 30/10/2026 • transfers left out`). On the right:
  **PDF…** (preview first, as every printout) and **CSV for Excel…** (save dialog, then a banner with **Open**).
- **Period bar** (remembered while the app is open; decided 2026-10-30):
  - presets **This month · Last month · This year · Last 12 months · Last year · Custom**;
  - periods that include today end today, so a comparison always covers the same days;
  - **Custom** shows two date fields in the Settings format, with an inline error when the start is after the end;
  - **Compare with** *Nothing / Previous period / Same period last year*, on By category and By member only.
- **Tabs** (decided 2026-10-30: one report each): **By category · Month by month · By member · Balances**.
- **By category:** **Spending | Income** and **Categories | Groups**.
  - Ranked bars in one hue (`chart-expense`, or `chart-income` for income), the amount, the share, and the change
    (signed amount and %, an arrow, and the words for screen readers).
  - *No category* is its own row, with a warning icon.
  - The name opens the log on that category (a group means all its categories) and period.
- **Month by month:** grouped columns of in and out per month (legend, values on the last month, crosshair
  tooltip with net; arrow keys read each month and Enter opens it), then a table: month · in · out · net · rows.
  - A month below zero shows red with an icon and the word "overspent".
  - Over 24 months the chart and table group by quarter, and the title says so.
- **By member:** spending per *For* (each parent, or Household for none), with the member's colour dot beside the
  name (bars in one hue), share and change. The chevron shows the member's top 5 categories; the name opens the
  log on that member and period.
- **Balances:** the line of money in accounts at each month end from the day before the period (vouchers apart,
  the Projections line chart), then each account's start · end · change, a total row, and meal vouchers listed
  apart.
  - Archived accounts show only for a period they held money or moved in.
- **States:** spinner; nothing booked in the period → an empty card with **This year** / **Last 12 months**; load
  or export error → banner.

## Behaviour

- Transfers never count.
- **By category** uses the budget's rule: a refund lowers its category (`actualFromSum`).
- **Month by month** and **By member** count rows as the Overview does: money in > 0, money out < 0, categorised
  or not.
- **Previous period** is the same number of days just before. **Same period last year** is the same dates a
  year earlier (29 Feb → 28 Feb).
- **Balances** = opening balance + every row up to each month end, the same rule as an account's balance.
- **Drill-down:** the log gained a **date range** filter beside the month. It shows as `01/01/2026 –
  30/10/2026` with ✕ (back to this month), and a range and a month never apply together.
- **CSV:** UTF-8 with a BOM, `;` between cells, CRLF lines; amounts with no currency or grouping in the app's
  language (`1234,56` in Greek), so Excel opens it in either language (decided 2026-10-30, no new dependency).

## Code

| Path | Role |
| --- | --- |
| `src/shared/reports.ts` | Types, presets and ranges, quarter grouping, ranking, shares, `csvMoney`, `toCsv` |
| `src/main/services/reports.ts` | `categoryReport`, `trendReport`, `memberReport`, `balanceReport` |
| `src/main/services/pdf/pdf-export.ts` | `saveCsv`; `openSavedFile` opens a PDF or CSV |
| `src/main/services/transactions.ts` | Log filter `from`/`to` |
| `src/renderer/src/pages/ReportsScreen.tsx` | Page: header, exports, tabs, states |
| `src/renderer/src/components/reports/` | `PeriodBar`, `ReportTabs` (one component per tab) |
| `src/renderer/src/components/charts/` | `LineChart` (also Projections), `ColumnChart`, `BarList` |
| `src/renderer/src/lib/report-documents.ts` | A tab as tables → `ReportDocument` (PDF) or CSV |
| `src/renderer/src/lib/chart-scale.ts` | y-axis scale and month labels shared by the charts |
| `src/renderer/src/store/reports.ts` | Period, tab and toggles per session; load (latest answer wins) |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `report:categories` | `({ range, compare, direction: 'OUT' \| 'IN', level: 'CATEGORY' \| 'GROUP' })` → `CategoryReport` | `INVALID_INPUT` |
| `report:trend` | `({ range })` → `TrendReport` | `INVALID_INPUT` |
| `report:members` | `({ range, compare })` → `MemberReport` | `INVALID_INPUT` |
| `report:balances` | `({ range })` → `BalanceReport` | `INVALID_INPUT` |
| `report:saveCsv` | `(content, fileName, title)` → saved path or cancelled | `INVALID_INPUT`, `CSV_EXPORT_FAILED` |

## Tests

- `src/shared/reports.test.ts`: presets ending today, previous and last-year ranges, months, quarters, ranking,
  shares, CSV.
- `src/main/__tests__/report-services.test.ts`: refunds, transfers, no category, groups, income, comparisons,
  bad range, month buckets cut to the period, quarters, members with Household, balances with vouchers and an
  archived account, and the log's date range.
- `lib/report-documents.test.ts`: a valid PDF document, CSV decimals per language, member and quarter rows, file
  name.
- `lib/chart-scale.test.ts`: chart scale and labels.

**Later:** a real `.xlsx` export if CSV is not enough; a per-account balance chart.
