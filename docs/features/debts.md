# Debts & loans

**User's job:** "How much do we still owe, when will it be paid off, and does paying a bit more help?" Before this
page, that meant a separate bank app for each loan plus mental arithmetic; now one page answers it. It opens from
**Debts & loans** in the sidebar, `Ctrl+K` "New debt or loan", or a bell row's **Open the debt**.

## UX

- **Header:** the title, a one-line subtitle and **New debt** (the one primary action).
- **Tiles:** **We owe** (total left to pay), **Monthly instalments**, **Debt-free by** (the latest payoff month,
  or a warning when one debt never ends) and, only when there is money owed to the household, **Owed to us**.
- **Debts / Payoff plan** (Segmented):
  - **Debts** has one card per debt, grouped as *We owe* and *Owed to us*, each group with its total. A card shows
    the name, the lender, card or person, and the rate when above 0. It also shows what is left (large), a meter of
    what is paid against the amount borrowed, "12 of 36 paid · next 30/11 · €304.22", and "Ends Oct 2029". Its
    badge reads **Paid off** or **Never ends**. Archived debts fold away under "Archived debts (N)".
  - **Payoff plan** has one money field, **Extra each month**, and a choice of **Highest rate** (avalanche, least
    interest) or **Smallest balance** (snowball, quick wins), each with a one-line hint. The headline reads
    "Debt-free by **Nov 2028**", then "11 months sooner and €274 less interest than the instalments alone".
    Below it come the order the extra goes in, each debt's month ("instead of Oct 2029"), and the debts left out
    of the plan with the reason.
- **Form** (`DebtForm`, mounted by App): the kind comes first (**Bank loan · Card instalments · Personal**), with a
  one-line hint; only that kind's fields follow.
  - **Bank loan:** name, lender (from Banks), amount borrowed, and a yearly rate where empty means interest-free.
    Its hint reads "Already paying it? Enter what is left today and the instalments left."
  - **Card instalments:** what was bought, the credit card (required), the total price, and the number of
    instalments. The rate is always 0.
  - **Personal:** **We owe / Owed to us**, name, person, amount and the date. **Paid back in fixed monthly amounts**
    (only for We owe) adds the schedule fields.
  - The schedule box says how long the debt runs, as **Number of months** or **Monthly payment**. It also holds the
    first instalment and **Paid from**. A live line under it reads "36 instalments of €304.22" or "Paid off in 24
    months", or turns red when the instalment never covers the interest.
  - **More options** holds the category (Debt types), the bank text to match, the reminder, **For** and a note.
  - A new debt's date follows its kind (the same day next month, or today) until the user types one.
- **Detail** (dialog) opens after a create, from a card, or from the bell.
  - **Figures:** left to pay (or "from the statement of …"), the payoff month with "n of N paid", and the interest
    still to pay (the instalment for interest-free debts). A personal debt shows what came back so far and the date.
  - **Schedule table:** payment, interest and principal (when there is a rate), balance after, and status. A row
    that is due or overdue has **Mark as paid**, which uses the bills dialog.
  - **Payments:** extra payments are listed, each with an undo to stop counting it.
  - **Footer:** **Extra payment** / **Record payment** / **Record money received** (primary). The **…** menu holds
    Edit, **Set balance from statement** (loans) and Archive/Restore.
  - A banner offers **Archive** once the debt is paid off. Another warns when the debt never ends.
- **Payment dialog:** recent rows going the right way, with likely ones first (the name or person is in the bank
  text). **Not in the bank (cash)** adds the row instead. Enter confirms and Esc closes.
- **Bills page:** instalments sit with the bills in **Upcoming** as "Instalment 5 of 24", and their menu opens the
  debt. **All** leaves them out and says where they are.
- **Bell:** **Instalment due** / **not paid yet** ("Car loan: instalment 1 of 36 due in 2 days"), with **Mark as
  paid**, **Skip** and **Open the debt**.
- **States:** an empty page explains the feature and offers **New debt**. Errors appear inline or in a banner.

## Behaviour

- **Interest** (decided 2026-10-30): bank loans and interest-free card instalments are both supported. The rate is
  yearly, nominal, in basis points. Each month the interest is charged on the balance first, then the instalment is
  paid. The instalment is the annuity for the term; interest-free debts split into equal parts rounded up, and the
  last instalment takes what is left.
- **Payments reuse bill rules** (decided 2026-10-30). A debt with a schedule owns a monthly `RecurringRule` (Debt
  category, from the first instalment to the last). Matching, **Mark as paid**, **Skip**, the bell, Upcoming bills
  and the budget provision all come from [subscriptions & bills](subscriptions-bills.md). The rule is edited and
  archived only through its debt (`DEBT_OWNED_RULE` otherwise).
- **Balance** = the amount borrowed (or the statement balance, counting only payments after its date). Each
  instalment paid (the real row amount, or the scheduled one when marked without a row) adds a month's interest and
  then lowers the balance. Extra payments go straight off the balance. Skipped instalments count for nothing.
  Instalments due more than 31 days before the debt was added count as already paid.
- **Extra payments** and payments of a debt with no schedule are rows linked by `Transaction.debtId`. Linked rows
  are never matched to a bill. A row can count for only one debt (`PAYMENT_ALREADY_LINKED`).
- After an extra payment or a statement balance, the rule's last due date moves to the projected payoff, so a
  debt paid early stops showing instalments.
- **Personal debts** run in both directions (decided 2026-10-30). *Owed to us* has no schedule and no rule; money
  received is income in the debt's category.
- **Payoff plan:** this covers active debts we owe that have an instalment and end at it. Every debt pays its
  instalment. The extra, plus the instalment of each cleared debt, goes to one debt at a time in the chosen order.
  The plan is compared with paying the instalments alone. It runs in the renderer (`planPayoff`).

## Code

| Path | Role |
| --- | --- |
| `src/shared/debt.ts` | Types, annuity, schedule, balance, payoff projection, snowball / avalanche |
| `src/main/services/debts.ts` | Debts CRUD with their owned rule, balance on read, statement balance, payments |
| `src/main/services/recurring.ts` | `DEBT_OWNED_RULE`, `debtId` and "instalment n of N" on rules and due dates |
| `src/main/services/notification-providers.ts` | `instalment-due` / `instalment-overdue` |
| `src/main/ipc/debt.ts` | `debt:*` handlers |
| `src/renderer/src/lib/debts.ts` | Form draft, rate text, live preview, tiles, plan input |
| `src/renderer/src/store/debts.ts` | Debts, the form request, the open detail |
| `src/renderer/src/pages/DebtsScreen.tsx` | The page |
| `src/renderer/src/components/debts/` | `DebtForm`, `DebtCard`, `DebtDetail`, `DebtPaymentDialog`, `DebtBalanceDialog`, `PayoffPlan` |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `debt:list` | — → `DebtRow[]` | — |
| `debt:get` | `id` → `DebtDetail` | `INVALID_INPUT`, `DEBT_NOT_FOUND` |
| `debt:create` / `debt:update` | (`id`,) `DebtInput` → id / — | `INVALID_INPUT`, `INSTALMENT_TOO_LOW`, `CATEGORY_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `MEMBER_NOT_FOUND`, `INSTITUTION_NOT_FOUND`, `DEBT_NOT_FOUND` |
| `debt:setBalance` | `{ debtId, balanceCents \| null, date }` → — | `INVALID_INPUT`, `DEBT_NOT_FOUND` |
| `debt:setArchived` | `id, archived` → — | `INVALID_INPUT`, `DEBT_NOT_FOUND` |
| `debt:paymentCandidates` | `id` → `CandidateRow[]` | `DEBT_NOT_FOUND` |
| `debt:linkPayment` | `{ debtId, transactionId }` → — | `TRANSACTION_NOT_FOUND`, `PAYMENT_ALREADY_LINKED`, `TRANSACTION_ALREADY_LINKED` |
| `debt:unlinkPayment` | `transactionId` → — | `INVALID_INPUT` |
| `debt:recordCash` | `{ debtId, accountId, bookedAt, amountCents }` → row id | as `transaction:create`, `DEBT_NOT_FOUND` |

## Tests

- `src/shared/debt.test.ts`: the annuity (€10,000 at 6 % for 36 months is €304.22), the interest-free split, the
  schedule, the term from an instalment, balance with a statement and with an extra payment, never-ending debts,
  and snowball versus avalanche against the baseline.
- `src/main/__tests__/debts.test.ts`:
  - the owned rule and its end date
  - an imported row ticks an instalment off; a hand mark counts and a skip does not
  - `DEBT_OWNED_RULE`, and an edit updating the rule
  - `INSTALMENT_TOO_LOW`
  - the statement balance and extra payments
  - archived debts keeping their balance
  - card instalments, and money owed to us
  - the bell kind
- `src/renderer/src/lib/debts.test.ts`: rate text, the live preview, draft checks and input, tiles, and plan input.

## Later

Projections (#11) and net worth (#18) use the remaining balance. Variable rates are covered for now by **Set
balance from statement**.
