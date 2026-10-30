# Subscriptions & bills

**User's job:** "What do we have to pay soon, what is paid already, and how much do fixed costs take each month?"
One page answers it, and nothing needs ticking off for bills the bank statement already shows. It is
**Subscriptions & bills** in the sidebar, the Overview's **Upcoming bills** card, **Track it** on a subscription hint,
and `Ctrl+K` "Add a bill or subscription".

## UX

- **Header:** the title, a one-line subtitle and **Add bill** (the one primary action). In Greek the bill is
  "πάγια πληρωμή", so it never reads like the Accounts page's "Νέος λογαριασμός".
- **Tiles:** **Fixed costs per month** (the monthly equivalents of every active outgoing rule, so yearly charges
  are spread over 12; regular income shown underneath), **Due in the next 30 days** (amount and count), and
  **Overdue** (in red, with an icon, only when above 0).
- **Hint banner:** "N charges look like subscriptions" with **Review**, which opens the hints list.
- **Upcoming / All bills** (Segmented):
  - **Upcoming** groups due dates as *Overdue · Next 7 days · Later this month · Next month · Paid and skipped*.
    Each group header shows what it pays out (income is never netted in). A row has the name, the schedule ("Every
    3 months"), a relative date ("In 2 days", "6 days ago"), the signed amount (≈ when it varies) and a status
    badge. Hovering a **Paid** badge shows the row that paid it and whether it was found or marked.
  - **All bills** groups rules by category type (Subscriptions, Bills, …, Income last). Each row shows the next due
    date, the amount and, for non-monthly rules, "per month €x". Archived rules are folded at the bottom with
    **Restore**.
- **Row menu (…):** Mark as paid… / Skip this one / Mark as unpaid (only for a hand mark) / Edit bill, plus
  Archive in *All bills*.
- **Form** (`BillForm`, mounted by App so any page can open it): name and amount, then **Amount varies**, then
  category (any type, creatable), then **How often** (Weekly, Every 2 weeks, Monthly, Quarterly, Yearly, Other… →
  "Every [N] [weeks/months/years]"), first due date and **Paid from** (any account by default). For a non-monthly
  outgoing rule a box shows "That is €40 a month…", with **Carry unspent money over in <category>** ticked. Under
  **More options** sit the bank text to match (with a live "Matches N rows of the last year"), the last payment and
  **For**.
- **Mark as paid** dialog: the rows within two weeks of the due date, with likely ones first and badged
  **Matches**. It also offers "Paid, no row to link" and **Paid in cash: add the row** (amount, date, account
  defaulting to Cash). With no rows to pick it opens straight on the cash form. Enter confirms and Esc closes.
- **Overview card:** overdue dates and dates in the next 14 days (5 rows, then "and N more"), with **See all**.
  Without rules it shows **Add a bill**.
- **Budget:** a row with no plan whose category has bills shows "€40 from bills · **Use**". The **…** menu gains
  **Fill empty lines from bills**, and an empty month offers **Start from your bills**.
- **States:** an empty page shows "No bills yet" with **Add bill** and "or review N suggestions". Errors appear
  inline or in a banner. After a save the row moves into place with no toast.

## Behaviour

- **No rows are created on a due date** (decided 2026-10-30). A row pays a due date when it has the same sign as the
  rule, its bank text or payee contains the rule's bank text (`payeeKey`), its amount is within ±10 % (any amount when
  it varies), it is in the same account when one is set, and it is booked within ±7 days (±2 for weekly rules). Each
  row pays only one due date: the nearest one first, then the closest amount. This matching runs on read, so an
  import or a typed row marks a bill paid at once.
- Only hand marks are stored (`RecurringOccurrence`: PAID with or without a row, or SKIPPED). Deleting a linked row
  removes its mark. Rows already paying another due date are not offered in the dialog.
- Due dates keep the anchor's day and are clamped at month end (31 Jan → 28/29 Feb → 31 Mar). A due date more than
  31 days before the rule was created is history and is never shown as overdue.
- **Provision** (decided 2026-10-30): a rule's monthly equivalent is `BudgetCategoryRow.suggestedCents` (weekly
  ×52/12, every N months ÷N, yearly ÷12, rounded up to the cent). It is never planned without the user's click.
- A merchant an active rule covers drops out of the subscription hints. A category with bills cannot be deleted,
  and merging categories moves its bills along.

## Code

| Path | Role |
| --- | --- |
| `src/shared/recurrence.ts` | Types, due dates, monthly equivalent, status, matching |
| `src/main/services/recurring.ts` | Rules CRUD, `listOccurrences`, marks, candidates, cash payment, budget sums |
| `src/main/ipc/recurring.ts` | `recurring:*` handlers |
| `src/renderer/src/lib/recurring.ts` | Form draft and checks, grouping, totals |
| `src/renderer/src/store/recurring.ts` | Rules, due dates, the form request |
| `src/renderer/src/pages/RecurringScreen.tsx` | The page |
| `src/renderer/src/components/recurring/` | `BillForm`, `BillRow`, `MarkPaidDialog` |
| `src/renderer/src/components/overview/UpcomingBillsCard.tsx` | The Overview card |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `recurring:list` | — → `RecurringRuleRow[]` | — |
| `recurring:create` / `recurring:update` | (`id`,) `RecurringRuleInput` → id / — | `INVALID_INPUT`, `CATEGORY_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `MEMBER_NOT_FOUND`, `RULE_NOT_FOUND` |
| `recurring:setArchived` | `id, archived` → — | `INVALID_INPUT`, `RULE_NOT_FOUND` |
| `recurring:occurrences` | `{ from, to }` → `UpcomingBill[]` | `INVALID_INPUT` |
| `recurring:candidates` | `{ ruleId, dueDate }` → `CandidateRow[]` | `RULE_NOT_FOUND`, `INVALID_DATE` |
| `recurring:countMatches` | `{ matchText }` → number | `INVALID_INPUT` |
| `recurring:markPaid` | `{ ruleId, dueDate, transactionId \| null }` → — | `INVALID_DATE`, `TRANSACTION_NOT_FOUND`, `TRANSACTION_ALREADY_LINKED` |
| `recurring:payInCash` | `{ ruleId, dueDate, accountId, bookedAt, amountCents }` → row id | as `transaction:create`, `INVALID_DATE` |
| `recurring:skip` / `recurring:unmark` | `{ ruleId, dueDate }` → — | `INVALID_DATE` |

## Tests

- `src/shared/recurrence.test.ts`: month-end clamping, leap years, every 2 weeks and every 3 months, end dates,
  next due, monthly equivalent, status, and matching (sign, text, tolerance, amount varies, window, one row per date).
- `src/main/__tests__/recurring-services.test.ts`: CRUD and validation, an imported row marks a date paid,
  hand links and their release on delete, cash payment, skip and unmark, history versus overdue, the match count,
  budget suggestions with **Fill from bills**, hints suppressed by a rule, and category delete and merge.
- `src/renderer/src/lib/recurring.test.ts`: presets, draft checks, hint → draft, grouping and totals.

## Later

- A payment calendar (#17). Reminders and the bell shipped with [notifications](notifications.md) (#8); rules feed
  [projections](projections.md) (#11) on their due dates.
