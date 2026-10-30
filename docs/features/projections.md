# Projections

**User's job:** "Are we going to be short, and when?" The page answers it from today's money, the bills, income
and instalments on their dates, and the budget plan. One click goes to the month that needs a change. Starts from
**Projections** in the sidebar (also `Ctrl+K`).

## UX

- **Header:** "Projections" with the context line (`from €590 today • 12 months • other months repeat the plan of
  October 2026`). On the right: **6 / 12 / 24 months** (12 by default, remembered per PC; decided 2026-10-30).
- **Tiles:** **Today** (money in accounts, meal vouchers apart), **Lowest point** (month-end amount and month;
  below 0 in red with a warning icon and the words "below zero"), **In N months** (end balance, more or less
  than today).
- **Banner:** when a month ends below 0, "The balance goes below zero in March 2027 (−€4.462,90)" with **Open
  budget** on that month. With no plan and no bills, an info banner links to **Budget** and **Subscriptions &
  bills** (the line stays flat).
- **Chart** (`dataviz` rules, hand-drawn SVG): month-end balance from a "Today" point, 2px line, dots with a
  surface ring, months below 0 in `chart-negative`, recessive gridlines, a stronger zero line, the lowest point
  labelled (with a surface halo). Hover or arrow keys (Home/End) move a crosshair, and the tooltip shows the
  month's end, in and out. The month table carries every number, so the chart is never the only source.
- **Month table:** month · **In** · **Out** · **Balance at month end** (signed, right-aligned). The month name
  opens its budget. The line under it says *rest of this month*, *plan of {month}* when repeated, or *bills only,
  no plan*. A chevron opens the categories of the month, largest first, each marked *bills*, *plan* or *bills +
  plan* with the rule names.
- **States:** spinner; no accounts → empty card with **Go to Accounts**; load error → banner. A footnote
  explains the rules below.

## Behaviour

- **Start:** the Overview's money total (`accountTotals().spendableCents`): every active account but meal
  vouchers, cards negative. Transfers between own accounts never count.
- **Months:** the current month (only what is still to come) plus the next N−1.
- **Per month and category** (decided 2026-10-30): the larger of the budget plan and the rules due that month
  (every due date of weekly, monthly, yearly and every-N rules; debt instalments are rules). A month with a plan
  of its own uses it. Any other month repeats **this month's plan** (or the latest one before it), so a one-off
  future month never spreads (decided 2026-10-30, after the walkthrough).
- **Current month:** expected − booked so far, never below 0, so a paid bill is not counted twice and an
  overspent category adds nothing more.
- **Savings categories:** rules only. Planned saving is usually a transfer to an account already in the total.
- **Meal-voucher top-ups** count as income. The food they pay for is in the spending plan, so the pair nets out
  even though the voucher balance is left out of the start.
- Archived rules and categories are left out; overdue bills from earlier months are not added (the bell shows
  them).
- Nothing is stored: the forecast is computed on read and reloads after any write.

## Code

| Path | Role |
| --- | --- |
| `src/shared/projection.ts` | Types, `HORIZONS`, `planMonthFor`, `projectMonths` (all the maths) |
| `src/main/services/projections.ts` | `getProjection`: accounts, rules, plans, booked so far → `projectMonths` |
| `src/renderer/src/pages/ProjectionsScreen.tsx` | Page: header, horizon switch, tiles, banners, states |
| `src/renderer/src/components/projections/` | `ProjectionChart`, `ProjectionTable` |
| `src/renderer/src/lib/projection.ts` | Chart scale and ticks, month labels, repeated plan month |
| `src/renderer/src/store/projections.ts` | Data and load (latest answer wins) |
| `src/renderer/src/store/ui.ts` | `projectionMonths`, remembered per PC |
| `src/renderer/src/assets/theme.css` | `chart-balance`, `chart-negative` (validated with the dataviz script, light + dark) |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `projection:get` | `(months: 6 \| 12 \| 24)` → `Projection` | `INVALID_INPUT` |

## Tests

`src/shared/projection.test.ts` (larger of plan and bills with the sign, repeating this month's plan and never
a later one-off, current month remaining, savings, yearly and every-N rules with end dates, lowest point and
first month below 0, unknown categories), `src/main/__tests__/projection-services.test.ts` (start = Overview
total with vouchers apart, transfers, debt instalments, archived rules and categories, bad horizon) and
`lib/projection.test.ts` (scale, labels, repeated plan month).

**Later:** what-if changes (a one-off expense, a pay rise) without touching the budget; a balance per account.
