# Domain Model (draft)

As of 2026-10-27. Entities are added to `prisma/schema.prisma` one feature at a time, and this doc is updated in the
same change. **In schema** marks what exists; the rest is a draft. Open questions are marked **?**.

## Money rules

- Amounts are `Int` cents (`…Cents`). Expense `< 0`, income `> 0` on booked transactions.
- A **transfer** between two own accounts (salary account → savings, paying off a credit card) is two rows sharing a
  `transferId`; transfers never count as income or expense in stats or budgets.
- Currency per account, default `EUR`. **?** Any foreign-currency accounts?

## Entities

| Entity | Purpose | Key fields |
| --- | --- | --- |
| **Member** | A family member who owns accounts or spends (parents; maybe children for pocket money) | name, colour, role (`PARENT`/`CHILD`) |
| **Account** *(in schema)* | Where money sits. One statement source = one account, so a credit card is an account of kind `CREDIT_CARD` | name, kind (`CURRENT`/`SAVINGS`/`CASH`/`CREDIT_CARD`), institution (`ALPHA`/`EUROBANK`/`OTHER`), currency, openingBalanceCents, openingDate, importProfile?, importMapping?, sortOrder, archivedAt |
| **Card** | A debit card on an account (later; credit cards are accounts) | accountId, holderMemberId, last4, kind, statementDay, dueDay, limitCents |
| **Category** *(in schema)* | Two levels: group → category (Bills → Electricity). The **type** is set on the group and its categories follow it | name, parentId, type (`INCOME`/`EXPENSE`/`BILL`/`SUBSCRIPTION`/`DEBT`/`SAVINGS`), icon, sortOrder, archivedAt |
| **Transaction** *(in schema)* | A booked movement. `categoryId = null` means "to categorise" (transfers never need one) | accountId, bookedAt (date only, 12:00 UTC), amountCents, description (bank text), payee, categoryId?, note, transferId?, importBatchId?, fingerprint?, bankReference?, balanceAfterCents? |
| **ImportBatch** *(in schema)* | One imported statement file; undo removes its rows; its closing balance is checked against the app | accountId, fileName, fileHash, dateFrom, dateTo, rowCount, importedCount, skippedCount, statementBalanceCents?, statementBalanceDate?, undoneAt |
| **CategoryRule** *(in schema)* | Merchant rule: the first match by priority sets an imported row's category and payee | pattern (normalised), match (`CONTAINS`/`STARTS_WITH`/`EXACT`), accountId?, categoryId, payee?, priority, hitCount |
| **Budget** | Plan for a month (yearly = 12 months) | month (`YYYY-MM`), lines: categoryId + plannedCents |
| **RecurringRule** | Subscriptions, bills, salary, and **non-monthly** charges (yearly insurance, quarterly tax, every-2-months utilities) | name, amountCents (or estimate), interval (`MONTH`/`YEAR`/…, every N), nextDue, accountId, categoryId, remindDaysBefore, endsAt |
| **Debt** | Loans, instalment purchases (άτοκες δόσεις), money owed to/by relatives | kind, principalCents, rate?, instalmentCents, startDate, termMonths, accountId, counterparty |
| **Goal** *(later)* | Saving target (holidays, car) | targetCents, targetDate, accountId |
| **Notification** | Reminders: bill due, over budget, debt instalment, low balance | kind, key, dueAt, readAt, dismissedAt |

### Rules that live in the services

- **Entering by hand**: the user types a positive amount and picks Expense or Income; the sign is stored from that.
  Income and expense rows need a category; a transfer never has one.
- **Transfers** are written as two rows in one database transaction. Deleting one side deletes a hand-entered other
  side; an imported other side stays (it is on a statement) and goes back to "to categorise".
- **Imported rows** keep their bank text and fingerprint when edited, so a later import still recognises them.
- **Statement import** never doubles a row: same bank reference or same fingerprint (account, date, cents, bank text
  and its occurrence number inside the file) → already imported; a hand-entered row with the same amount ±3 days →
  possible duplicate (Link keeps one row); the opposite amount in another own account ±5 days → transfer. Code and
  rationale: `src/main/services/import/` (`fingerprint.ts`, `dedupe.ts`, `transfer-match.ts`). Undo removes the rows
  an import created; rows it linked or paired stay. An ATM withdrawal imported as a transfer to Cash writes the cash
  side in the same import. Feature doc: [features/statement-import.md](features/statement-import.md).
- **Balance check**: an import stores the statement's closing balance (a card's debt as negative) and its day; the
  app compares it with the account's balance on that day, after the import and in past imports. It only warns.
- **Category rules** are stored folded like the payee key (no accents, digits or "POS"); whole words match; a rule
  the user teaches (priority 1000) beats the seeded merchants, and the same pattern again updates it.
- **Starting data**: an empty database gets the category groups (one per type) and common Greek merchant rules, in
  the app language of that moment (`src/main/services/seed.ts`). After that they are the household's own data.

## Derived views (no tables)

- **Balance** of an account = opening balance + sum of its transactions.
- **Budget vs actual** per category and month = planned lines vs sum of expense transactions (transfers excluded).
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
3. Children: members with pocket money, or only as a spending tag?
4. ~~Cash: tracked as an account, or only as "cash withdrawal" expenses?~~ An account of kind `CASH`; ATM withdrawals
   are transfers to it (2026-10-26).
5. Shared vs personal money: do the parents want private accounts hidden from each other?
