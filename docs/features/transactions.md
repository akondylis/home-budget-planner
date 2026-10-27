# Transactions & categories

**User's job:** get every movement of money into one log, each in the right category, so the month's income and
spending are true. Cash is typed in by hand in seconds; bank and card rows come from
[statement import](statement-import.md).

## UX

- **Entry points:** sidebar › **Transactions**; **New transaction** (primary) on the page, on each account card,
  `Ctrl+N` anywhere and `Ctrl+K`.
- **Entry form** (a dialog): **Expense / Income / Transfer**, amount first with focus (typed positive; the type
  gives the sign), category, payee, date, account, note. Defaults: today, the last used account, and the last
  category used for that payee (payees autocomplete). **Add expense** names the outcome; **Add & new**
  (`Ctrl+Enter`) keeps date and account for a pile of receipts. Errors sit next to their field.
- **Transfer** shows *From* and *To* and writes both sides; it never asks for a category.
- **Dates** are typed in the format chosen in Settings ("3/10" = this year), ↑/↓ move a day, the calendar button
  opens a picker, and a day that does not exist (31/02) is flagged.
- **Log:** month stepper (or all months), account, type and category filters, and **To categorise (n)**. Tiles show
  income, spending and net for the filter; transfers count as neither. Rows: date (a download mark if imported),
  payee or bank text with the account under it, an inline category picker (amber when empty), the signed amount.
  Tick rows for **Set category** in bulk; click a row to edit it.
- **To categorise:** an amber banner says how many rows have no category, so totals are incomplete, with **Show
  them**. An empty inbox says so ("All sorted").
- **Rule prompt:** sorting an imported row by hand asks "Always put *ΒΑΣΙΛΟΠΟΥΛΟΣ* in *Σούπερ μάρκετ*?";
  **Always** saves a rule and sorts the other waiting rows of that merchant.
- **Subscription hint:** when a merchant charges about the same every month or year (3+ times), an info banner
  offers **Review**: sort it under a Subscriptions category (and learn a rule) or mark it "Not a subscription".

## Categories

- Two levels: a group (Bills, Spending…) with categories. The **type** (`INCOME`, `BILL`, `SUBSCRIPTION`,
  `EXPENSE`, `DEBT`, `SAVINGS`) is set on the group; its categories follow it.
- An empty database gets a Greek (or English) starter set, one group per type, plus common Greek merchant rules
  (ΔΕΗ, COSMOTE, NETFLIX, ΣΚΛΑΒΕΝΙΤΗΣ, LIDL, SHELL…), in the app language of that moment.
- Pickers search by name and group, ignoring accents and Greek/Latin script; income rows offer income groups, the
  rest offer everything else; the subscription hint offers only Subscriptions.
- A screen to rename, merge or archive categories is not built yet (services exist).

## Behaviour

- Expense `< 0`, income `> 0`, in cents. A transfer is two rows sharing `transferId`, written in one database
  transaction; editing it rewrites both sides; deleting a hand-entered side deletes both, but an imported side
  stays as a plain row to categorise.
- Two opposite rows in different accounts can be linked into a transfer (`transaction:linkTransfer`); their
  categories are cleared.
- Imported rows keep their bank text and fingerprint when edited, so the next statement still recognises them.
- **Rules:** a pattern is stored folded like `payeeKey()` (no accents, digits or "POS"/"ΑΓΟΡΑ"), matches whole
  words, and a learned rule (priority 1000) beats the seeded list. The same pattern again updates the rule.
- **Subscription hints:** same merchant, amount within ±10% of the latest, steps of 26–35 days (monthly) or
  350–380 days (yearly), at least 3 charges, the latest within two intervals of today. Merchants already in a
  Subscriptions, Bills, Debt or Savings category are skipped; dismissed ones are remembered on this computer.

## Code

| Path | Role |
| --- | --- |
| `src/main/services/transactions.ts` | List (filters, pagination, totals), create, update, set category, transfers, delete, payees |
| `src/main/services/categories.ts`, `seed.ts` | Category tree, create/update/archive; starting categories and rules |
| `src/main/services/rules.ts` | Rule list/create/update/delete; apply a new rule to waiting rows |
| `src/main/services/subscriptions.ts`, `import/subscription-detect.ts` | Subscription hints |
| `src/renderer/src/pages/TransactionsScreen.tsx` | Log page, banners, import landing |
| `src/renderer/src/components/transactions/` | `TransactionForm`, `TransactionList`, `TransactionFilters`, `CategoryPicker` |
| `src/renderer/src/components/subscriptions/SubscriptionHints.tsx` | Hint review dialog |
| `src/renderer/src/components/ui/DateInput.tsx` | Date field in the Settings format |
| `src/renderer/src/store/transactions.ts` | Filter, page, selection |
| `src/shared/ledger.ts`, `src/shared/payee-key.ts` | Shapes; merchant key and display text |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `transaction:list` | `(TransactionFilter)` → `TransactionPage` | `INVALID_INPUT` |
| `transaction:payees` | `()` → `PayeeSuggestion[]` | — |
| `transaction:create` / `:update` | `(input)` / `(id, input)` | `INVALID_INPUT`, `INVALID_AMOUNT`, `ACCOUNT_NOT_FOUND`, `CATEGORY_REQUIRED`, `CATEGORY_NOT_FOUND`; update adds `TRANSACTION_NOT_FOUND`, `TRANSACTION_IS_TRANSFER` |
| `transaction:setCategory` | `(ids, categoryId)` → count | `INVALID_INPUT`, `CATEGORY_NOT_FOUND` |
| `transaction:createTransfer` / `:updateTransfer` | `(input)` / `(transferId, input)` | `INVALID_INPUT`, `INVALID_AMOUNT`, `SAME_ACCOUNT`, `ACCOUNT_NOT_FOUND`; update adds `TRANSACTION_NOT_FOUND`, `TRANSFER_IMPORTED` |
| `transaction:linkTransfer` | `(idA, idB)` → transferId | `TRANSACTION_NOT_FOUND`, `TRANSFER_MISMATCH` |
| `transaction:delete` | `(id)` | `TRANSACTION_NOT_FOUND` |
| `category:list` / `:create` / `:update` / `:archive` | tree; `(input)`; `(id, input)`; `(id)` | `INVALID_INPUT`, `CATEGORY_NOT_FOUND`, `CATEGORY_EXISTS` |
| `rule:list` / `:create` / `:update` / `:delete` | `RuleSummary[]`; `(RuleInput)` → `{ id, appliedCount }`; `(id, patch)`; `(id)` | `INVALID_INPUT`, `CATEGORY_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `RULE_NOT_FOUND` |
| `subscription:hints` | `()` → `SubscriptionHint[]` | — |

## Tests

`src/main/__tests__/ledger-services.test.ts` (signs, validation, month filter, groups, pagination, bulk category,
payees, transfers and linking), `rules.test.ts`, `services/import/subscription-detect.test.ts`, and the subscription
case in `statement-import.test.ts`; `lib/ledger.test.ts` (entry validation and defaults, pickers),
`shared/date-format.test.ts` and the `DateInput` block in `components/ui/ui.test.tsx`.
