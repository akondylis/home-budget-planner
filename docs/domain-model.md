# Domain Model (draft)

As of 2026-10-29. Entities are added to `prisma/schema.prisma` one feature at a time, and this doc is updated in the
same change. **In schema** marks what exists; the rest is a draft. Open questions are marked **?**.

## Money rules

- Amounts are `Int` cents (`…Cents`). Expense `< 0`, income `> 0` on booked transactions.
- A **transfer** between two own accounts (salary account → savings, paying off a credit card) is two rows sharing a
  `transferId`; transfers never count as income or expense in stats or budgets.
- Currency per account, default `EUR`. **?** Any foreign-currency accounts?

## Entities

| Entity | Purpose | Key fields |
| --- | --- | --- |
| **Member** *(in schema)* | A parent of the household (children are not tracked); archived, never deleted. Who uses the app is chosen per PC, not stored here | name, colour (palette key from `MEMBER_COLOURS`), sortOrder, archivedAt |
| **Account** *(in schema)* | Where money sits. One statement source = one account, so a credit card is an account of kind `CREDIT_CARD` | name, kind (`CURRENT`/`SAVINGS`/`CASH`/`CREDIT_CARD`/`MEAL_VOUCHER`), institutionId? (null = no bank), currency, openingBalanceCents, openingDate, importProfile?, importMapping?, holderMemberId? (null = joint), sortOrder, archivedAt |
| **Institution** *(in schema)* | A bank or meal-card issuer from the user's list (Settings › Banks); archived, never deleted. Starter list seeded by its migration with fixed ids `inst_…` | name (unique), kind (`BANK`/`VOUCHER_ISSUER`), statementPreset? (`alpha`/`eurobank`), sortOrder, archivedAt |
| **Card** *(in schema)* | A plastic card on an account: debit cards on a current account, main and supplementary cards on a credit card account (the credit card itself is the account). Removed with its account's card list; matching a row to its card: later | accountId, last4 (4 digits, unique per account), holderMemberId?, sortOrder |
| **Category** *(in schema)* | Two levels: group → category (Bills → Electricity). The **type** is set on the group and its categories follow it | name, parentId, type (`INCOME`/`EXPENSE`/`BILL`/`SUBSCRIPTION`/`DEBT`/`SAVINGS`), icon, sortOrder, carryOver (unspent budget moves to next month), archivedAt |
| **Transaction** *(in schema)* | A booked movement. `categoryId = null` means "to categorise" (transfers never need one) | accountId, bookedAt (date only, 12:00 UTC), amountCents, description (bank text), payee, categoryId?, note, memberId? (who it was for; null = household), createdByMemberId? (who entered it; set once), transferId?, importBatchId?, fingerprint?, bankReference?, balanceAfterCents? |
| **ImportBatch** *(in schema)* | One imported statement file; undo removes its rows; its closing balance is checked against the app | accountId, fileName, fileHash, dateFrom, dateTo, rowCount, importedCount, skippedCount, statementBalanceCents?, statementBalanceDate?, createdByMemberId?, undoneAt |
| **CategoryRule** *(in schema)* | Merchant rule: the first match by priority sets an imported row's category and payee | pattern (normalised), match (`CONTAINS`/`STARTS_WITH`/`EXACT`), accountId?, categoryId, payee?, priority, hitCount |
| **Budget** *(in schema)* | The plan for one month (yearly = 12 months, later) | month (`YYYY-MM`, unique) |
| **BudgetLine** *(in schema)* | Planned amount of one category (never a group) in one month, stored positive; removed with its budget | budgetId, categoryId, plannedCents (unique per budget and category) |
| **RecurringRule** | Subscriptions, bills, salary, and **non-monthly** charges (yearly insurance, quarterly tax, every-2-months utilities) | name, amountCents (or estimate), interval (`MONTH`/`YEAR`/…, every N), nextDue, accountId, categoryId, remindDaysBefore, endsAt |
| **Debt** | Loans, instalment purchases (άτοκες δόσεις), money owed to/by relatives | kind, principalCents, rate?, instalmentCents, startDate, termMonths, accountId, counterparty |
| **Goal** *(later)* | Saving target (holidays, car) | targetCents, targetDate, accountId |
| **Notification** | Reminders: bill due, over budget, debt instalment, low balance | kind, key, dueAt, readAt, dismissedAt |

### Rules that live in the services

- **Entering by hand**: the user types a positive amount and picks Expense or Income; the sign is stored from that.
  Income and expense rows need a category; a transfer never has one.
- **Transfers** are written as two rows in one database transaction. Deleting one side deletes a hand-entered other
  side; an imported other side stays (it is on a statement) and goes back to "to categorise". A saved row can be
  turned into a transfer: it loses its category and member, and the other side is written in the row's import.
- **Meal-voucher cards** (Edenred, Up Hellas; kind `MEAL_VOUCHER`): the employer's top-up is income in **Meal
  vouchers** (created with the first card when missing), food bought with the card is an ordinary expense. Money never
  leaves the card by transfer (`VOUCHER_NO_TRANSFER_OUT`; transfers in are allowed), it is never imported, and once
  parents exist the card names its holder (`HOLDER_REQUIRED`). Its balance is not "spendable": totals show it beside
  the accounts total, and an expense that takes it below zero is warned about, not refused. Feature doc:
  [features/meal-vouchers.md](features/meal-vouchers.md).
- **Imported rows** keep their bank text and fingerprint when edited, so a later import still recognises them.
- **Statement import** never doubles a row: same bank reference and amount (a bank can give interest and its tax one reference), or same fingerprint (account, date, cents, bank text
  and its occurrence number inside the file) → already imported; a hand-entered row with the same amount ±3 days →
  possible duplicate (Link keeps one row); the opposite amount in another own account ±5 days → transfer. Code and
  rationale: `src/main/services/import/` (`fingerprint.ts`, `dedupe.ts`, `transfer-match.ts`). Undo removes the rows
  an import created; rows it linked or paired stay. An ATM withdrawal imported as a transfer to Cash writes the cash
  side in the same import. Feature doc: [features/statement-import.md](features/statement-import.md).
- **Balance check**: an import stores the statement's closing balance (a card's debt as negative) and its day; the
  app compares it with the account's balance on that day, after the import and in past imports. It only warns.
- **Category rules** are stored folded like the payee key (no accents, digits or "POS"); whole words match; a rule
  the user teaches (priority 1000) beats the seeded merchants, and the same pattern again updates it.
- **Changing categories**: archiving hides a category (a group takes its categories) but its rows keep it and still
  count; moving a category to another group gives it that group's type; **merging** A into B moves A's rows and
  rules to B (a rule B already has is dropped) and archives the empty A; only a category no row uses can be
  deleted (its rules and budget lines go with it), and only an empty group; a merge adds A's budget lines to B's
  (same month → summed). Feature doc: [features/categories.md](features/categories.md).
- **Starting data**: an empty database gets the starter category groups (one per type; spending is split into Food,
  Home, Transport, Health, Personal care, Leisure and Family & other) and common Greek merchant rules, in
  the app language of that moment (`src/main/services/seed.ts`). After that they are the household's own data.

## Derived views (no tables)

- **Balance** of an account = opening balance + sum of its transactions.
- **Budget vs actual** per category and month: *actual* = −sum of its rows for outgoing types (a refund lowers
  it), +sum for income; transfers have no category, so they never count. *Carried in* (carry-over categories) =
  max(0, last month's planned + carried in − actual), chained from the first planned month; *available* = planned +
  carried in. **Left to budget** = planned income − planned outgoings (zero-based goal 0); **left to spend** =
  available − actual over outgoing types. Feature doc: [features/budget.md](features/budget.md).
- **Upcoming** = recurring rules and debt instalments due in the next N days, each `UPCOMING` / `DUE` / `OVERDUE` /
  `PAID` (matched to a transaction) / `SKIPPED`.
- **Projection** = today's balances + planned income − recurring charges − instalments, month by month.
- **Subscription hints** = the same merchant charging within ±10% every month (26–35 days) or year (350–380), at
  least 3 times and recently, not already in a Subscriptions, Bills, Debt or Savings category
  (`services/import/subscription-detect.ts`).
- **Subscriptions without monthly payment**: rules with interval ≠ 1 month are spread as a monthly *provision*
  (yearly €480 insurance → €40/month set aside) so the monthly budget is honest.

## Open questions

1. Who enters data: both parents on one PC, or each on their own PC/phone? (drives the multi-PC decision)
2. ~~Bank data: manual entry only, CSV/Excel statement import per bank, or later open-banking sync?~~ Manual entry
   plus CSV import for Alpha Bank and Eurobank (2026-10-26).
3. ~~Children: members with pocket money, or only as a spending tag?~~ Parents only; children are not tracked
   (2026-10-27).
4. ~~Cash: tracked as an account, or only as "cash withdrawal" expenses?~~ An account of kind `CASH`; ATM withdrawals
   are transfers to it (2026-10-26).
5. Shared vs personal money: do the parents want private accounts hidden from each other?
