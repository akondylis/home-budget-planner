# Overview

**User's job:** open the app and see in five seconds how this month is going and the one thing that needs the
parents next. It is the default page (**Overview** in the sidebar, `Ctrl+K`) and always shows the current month.

## UX

- **Header:** "Overview", the month underneath, and **Print worksheet** on the right (the blank monthly sheet).
- **Tiles** (2×2 on narrow windows, one row from `lg`). Each whole tile is a button that opens where its number
  comes from:
  - **Income this month**: every income row, categorised or not. The hint shows "Expected €x" when the budget plans
    income. Opens the log on this month.
  - **Spent this month**: every expense row. Opens the log on this month.
  - **Left to spend**: from the budget (available − spent), with the budget's meter and "Over the plan by €x" in red
    text. Without a plan it reads **No plan yet · Plan this month →** instead of a made-up 0. Opens **Budget** on
    this month.
  - **In accounts**: the sum of the active accounts that can pay for anything (credit cards count as debt). The
    meal-voucher balance is shown beside it as "+ €x meal vouchers" (food only, not in the total). Opens
    **Accounts & cards**.
- **Banners**, under the tiles and most urgent first; they never repeat a tile:
  - **Over the plan** (warning icon and text, so colour is never the only sign): names the two categories that are
    furthest over ("Super market by €120, Eating out by €40"), then "and N more". **Open budget**.
  - **To categorise**: the budget's text and its **Categorise** action (opens the log on this month's rows with no
    category).
- **Setup checklist:** members, accounts, categories and budget, each ticked from real data and each with a link
  (Household, Accounts, Categories, Budget). The card hides once every step is done, so the page then belongs to
  the month. The categories step ticks once the household has created a category of its own: the starter list is
  written in one go on first run, so anything created more than a minute after the first category counts
  (`countOwnCategories()`, the meal-voucher category the app adds to older databases left out).
- **Upcoming bills:** overdue bills and those due in the next 14 days, oldest first (5 rows, then "and N more"), each
  with its relative date, signed amount and status; rows and **See all** open **Subscriptions & bills**. Without
  bills it offers **Add a bill**. See [subscriptions & bills](subscriptions-bills.md).
- **States:** "…" in the tiles while loading. A load error shows a warning banner with **Try again**. The page
  reloads after every write (the ledger store's `revision`), so a transaction saved with `Ctrl+N` updates it at once.

## Behaviour

- Income and Spent are cash flow: every row of the month, with transfers between own accounts left out. They can
  differ from the budget's actuals, which count only categorised rows.
- Left to spend and the over-budget list come from `getBudgetMonth` unchanged, so the Overview and Budget always
  agree. Only outgoing categories with `leftCents < 0` count as over; income above its plan never does.
- Meal-voucher cards are never in the spendable total (`isSpendable`). Archived accounts are left out.
- The Budget step counts as done when this month or last month has a plan.

## Code

| Path | Role |
| --- | --- |
| `src/main/services/overview.ts` | `getOverview(month)`: the budget month, the month's income and spending, unpaid bills |
| `src/main/ipc/overview.ts` | `overview:get` handler |
| `src/shared/overview.ts` | `OverviewMonth`, `overBudgetCategories`, `accountTotals` |
| `src/renderer/src/pages/OverviewScreen.tsx` | Loading, setup checklist |
| `src/renderer/src/components/overview/UpcomingBillsCard.tsx` | Upcoming bills card |
| `src/renderer/src/components/overview/OverviewTiles.tsx` | The four tiles as buttons |
| `src/renderer/src/components/overview/OverviewBanners.tsx` | Over the plan and To categorise banners |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `overview:get` | `month: 'yyyy-MM'` → `OverviewMonth` | `INVALID_INPUT` |

## Tests

- `src/shared/overview.test.ts`: over-budget order, income ignored, account totals (vouchers apart, archived out).
- `src/main/__tests__/overview-services.test.ts`: uncategorised rows counted, transfers left out, an empty month is 0; own categories counted, the starter list and the voucher category left out
  and not −0, the plan comes along, and a bad month is rejected.

## Later

- Over-budget and bill-due notifications (#8).
