# Domain Model (draft)

As of 2026-10-26. A starting point for discussion: entities are added to `prisma/schema.prisma` one feature at a
time, and this doc is updated in the same change. Open questions are marked **?**.

## Money rules

- Amounts are `Int` cents (`…Cents`). Expense `< 0`, income `> 0` on booked transactions.
- A **transfer** between two own accounts (salary account → savings, paying off a credit card) is two rows sharing a
  `transferId`; transfers never count as income or expense in stats or budgets.
- Currency per account, default `EUR`. **?** Any foreign-currency accounts?

## Entities

| Entity | Purpose | Key fields |
| --- | --- | --- |
| **Member** | A family member who owns accounts or spends (parents; maybe children for pocket money) | name, colour, role (`PARENT`/`CHILD`) |
| **Account** | Where money sits: current, savings, cash, credit card, loan, meal voucher | name, kind, institution, ownerMemberId, currency, openingBalanceCents, archivedAt |
| **Card** | A debit/credit card linked to an account | accountId, holderMemberId, last4, kind, statementDay, dueDay, limitCents |
| **Category** | Two levels: group → category (Housing → Rent, Electricity) | name, parentId, kind (`EXPENSE`/`INCOME`), icon, archivedAt |
| **Transaction** | A booked movement | accountId, cardId?, bookedAt, amountCents, payee, categoryId, memberId, note, transferId?, recurringRuleId?, debtId? |
| **Budget** | Plan for a month (yearly = 12 months) | month (`YYYY-MM`), lines: categoryId + plannedCents |
| **RecurringRule** | Subscriptions, bills, salary, and **non-monthly** charges (yearly insurance, quarterly tax, every-2-months utilities) | name, amountCents (or estimate), interval (`MONTH`/`YEAR`/…, every N), nextDue, accountId, categoryId, remindDaysBefore, endsAt |
| **Debt** | Loans, instalment purchases (άτοκες δόσεις), money owed to/by relatives | kind, principalCents, rate?, instalmentCents, startDate, termMonths, accountId, counterparty |
| **Goal** *(later)* | Saving target (holidays, car) | targetCents, targetDate, accountId |
| **Notification** | Reminders: bill due, over budget, debt instalment, low balance | kind, key, dueAt, readAt, dismissedAt |

## Derived views (no tables)

- **Balance** of an account = opening balance + sum of its transactions.
- **Budget vs actual** per category and month = planned lines vs sum of expense transactions (transfers excluded).
- **Upcoming** = recurring rules and debt instalments due in the next N days, each `UPCOMING` / `DUE` / `OVERDUE` /
  `PAID` (matched to a transaction) / `SKIPPED`.
- **Projection** = today's balances + planned income − recurring charges − instalments, month by month.
- **Subscriptions without monthly payment**: rules with interval ≠ 1 month are spread as a monthly *provision*
  (yearly €480 insurance → €40/month set aside) so the monthly budget is honest.

## Open questions

1. Who enters data: both parents on one PC, or each on their own PC/phone? (drives the multi-PC decision)
2. Bank data: manual entry only, CSV/Excel statement import per bank, or later open-banking sync?
3. Children: members with pocket money, or only as a spending tag?
4. Cash: tracked as an account, or only as "cash withdrawal" expenses?
5. Shared vs personal money: do the parents want private accounts hidden from each other?
