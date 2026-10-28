# Monthly budget

**User's job:** at the start of the month, give every euro of expected income a job in two minutes; during the
month, see at a glance how much is left in each category and where the household went over. Starts from **Budget**
in the sidebar (also `Ctrl+K`), on the current month.

## UX

- **Header:** "Budget", then the context line (`past month • 18 categories planned • updated 28/10/2026`). On the
  right: the month switcher `‹ October 2026 ›` (PageUp / PageDown when no field has focus), **This month** when away
  from it, **Print**, and **More** (*Fill empty lines from the plan of …*, *… from … spending*, *Clear plan*).
- **Tiles:** **Expected income** (received so far), **Left to budget** (income − planned outgoings; at 0 "Every euro
  has a job" with a check, below 0 a warning icon), **Left to spend** (spent of available, with a meter).
- **Banners:** rows of the month with no category ("… so they are not in the budget", **Categorise** opens the log
  on those rows) and spending in categories with no plan (**Show** scrolls to the first one, flagged *Not planned*).
- **Table:** one collapsible card per type (Income, Bills, Subscriptions, Spending, Debt, Savings), a summary on the
  card title ("planned €1.200 · spent €850"), each group as a grey sub-header with its sums, then its categories:
  name · **Planned** (inline input) · Spent · Left · meter · **More**. Income reads *Expected · Received · To come*.
  - **Planned cell:** type and press Enter (saves, moves to the next category), Tab, or leave it; Esc puts the saved
    amount back; ↑/↓ move between categories. A check shows for 1.5 s after a save; a bad amount shows the error
    under the cell. Blank or 0 removes the line.
  - **Over the plan:** the Left amount turns red with a warning icon and the meter fills red; the text says "over",
    so colour is never the only sign.
  - **Carry over:** a ↻ mark on the name; "+€40 from September" under it when money was carried in.
  - **More:** *Show transactions* (the log on this month and category), *Set to last month's spending (€x)*,
    *Carry unspent money into next month* / *Stop carrying* (outgoing categories only).
- **Empty month:** "No plan for October 2026 yet", with the best start as the primary button: *Copy the plan of
  September*, else *Start from September spending*, else *Start blank*. The others stay as secondary buttons.
- **States:** loading spinner; future month (Spent shows "—", no meters); no categories (link to Categories);
  archived categories show (read-only, *Archived*) only in months they were planned or used in.

## Behaviour

- **Plan level:** amounts per category; a group shows the sum of its categories. Income is planned per income
  category too (decided 2026-10-28).
- **Actual** = −sum of the category's rows in the month for outgoing types (a refund lowers it), +sum for income.
  Transfers have no category, so they never count; uncategorised rows are only counted in the banner.
- **Left to budget** = planned income − planned outgoings (zero-based: the goal is 0).
  **Left to spend** = available − actual over outgoing categories, where *available* = planned + carried in.
- **Carry over** (per category, opt-in, decided 2026-10-28): unspent money of a month moves into the next,
  chained from the first month the category was planned; a month without a line plans 0 but still carries.
  Overspending never carries (the carry stops at 0).
- **Copy** fills **only empty lines** of the month from last month's plan, or from last month's spending rounded up
  to whole euros; typed amounts are never overwritten. Nothing to copy → `BUDGET_SOURCE_EMPTY`.
- **Categories:** a merge adds the merged category's lines to the target (same month → summed); deleting an unused
  category deletes its lines; archiving keeps them.
- Saves are applied on screen at once and reloaded from the database; a failed save puts the stored amount back.

## Code

| Path | Role |
| --- | --- |
| `src/shared/budget.ts` | Types and the maths: actual from sums, carry chain, rows, group sums, tiles |
| `src/main/services/budgets.ts` | Month view (one grouped sum per month, carry for carry-over categories), set, copy, clear |
| `src/main/services/categories.ts` | `setCarryOver`; merge and delete handle budget lines |
| `src/renderer/src/pages/BudgetScreen.tsx` | Page: header, empty state, banners, print |
| `src/renderer/src/components/budget/` | `MonthSwitcher`, `BudgetSummaryTiles`, `BudgetTable`, `PlannedCell` |
| `src/renderer/src/components/ui/Meter.tsx` | Kit meter: accent → warning → danger fill on a lighter track of the same ramp |
| `src/renderer/src/store/budget.ts` | Month, data, optimistic set, copy, clear, carry-over, outcome of a `Ctrl+K` copy |
| `src/renderer/src/lib/budget.ts` | Month helpers, Planned cell text and parsing, meter tone, optimistic recompute |
| `src/renderer/src/lib/budget-worksheet.ts` | `buildBudgetStatement`: the worksheet filled from the month |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `budget:get` | `(month)` → `BudgetMonth` | `INVALID_INPUT` |
| `budget:setPlanned` | `(month, categoryId, plannedCents)`; 0 removes the line | `INVALID_INPUT`, `INVALID_AMOUNT`, `CATEGORY_NOT_FOUND` |
| `budget:copy` | `({ from, to, source: 'PLAN' \| 'ACTUAL' })` → lines written | `INVALID_INPUT`, `BUDGET_SOURCE_EMPTY` |
| `budget:clear` | `(month)` | `INVALID_INPUT` |
| `category:setCarryOver` | `(id, carryOver)` | `INVALID_INPUT`, `CATEGORY_NOT_FOUND` |

## Tests

`src/shared/budget.test.ts` (signs and refunds, carry chain, rows and tiles), `src/main/__tests__/budget-services.test.ts`
(set/remove, refusals, transfers left out, unplanned and uncategorised counts, archived categories, carry over
across a month with no line, copy of plan and spending, clear, merge and delete), `lib/budget.test.ts` (month
helpers, Planned cell, meter tone, optimistic recompute), `lib/budget-worksheet.test.ts` (filled statement) and the
`Meter` block in `components/ui/ui.test.tsx`.

**Later:** budgeting per pay period (with Yearly budget #10); over-budget notifications (#8); Overview tiles (#6).
