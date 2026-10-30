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
  (`Ctrl+Enter`) keeps date and account for a pile of receipts. Errors sit next to their field. Editing names the
  row in the title; an imported row without a payee opens with the merchant from its bank text, and the bank line
  shows under the payee field.
- **Transfer** shows *From* and *To* and writes both sides; it never asks for a category.
- **Dates** are typed in the format chosen in Settings ("3/10" = this year), ↑/↓ move a day, the calendar button
  opens a picker, and a day that does not exist (31/02) is flagged.
- **Search** (first in the filter row, `Ctrl+F` anywhere): payee, bank text, note, category or account, ignoring
  case, accents and Greek/Latin script, or an amount ("12,50", either sign). It narrows the current filters; Esc
  or × clears it.
- **Sorting:** click Date, Description, Category or Amount; again to flip. Amount starts with the biggest expense;
  transfers and rows to categorise stay last in a category sort.
- **Log:** month stepper (or all months), account, type and category filters, and **To categorise (n)**. Tiles show
  income, spending and net for the filter; transfers count as neither. Rows: date (a download mark if imported),
  payee or bank text with the account under it, an inline category picker (amber when empty), the signed amount.
  Tick rows for **Set category** (or a transfer to/from an own account when all ticked rows go the same way;
  all-or-nothing), **Set payee** (known payees suggested; empty clears it, imported rows keep their
  bank text) or **Set “For”** in bulk; Shift+click a second box to tick (or untick) every row shown between;
  click a row to edit it.
- **Right-click a row** (or the Menu key / Shift+F10 on a control in it) for *Edit*, *Set category…*, *Set who it is
  for…*, *Create a rule from this…* (the rule form with the merchant text and category filled in), *Select*,
  *Show similar transactions* (search by merchant, all months) and *Delete* (confirmed). On a ticked row the menu
  says "3 selected rows" and category, "For" and delete act on all of them. Every item is also reachable without it.
- **One category picker everywhere** a category is assigned (log row and bulk, entry form, import review,
  subscription hint, rule form): the same grouped search, only the groups that fit the money's direction (mixed bulk
  selection → all), and **Create «…»** when the search finds nothing (a small dialog asks the group, then the new
  category is used). Filters and the merge target use the same list without create.
- **Row → transfer:** a log row's picker also lists *Transfer between my accounts* ("To Cash" / "From Savings", cash
  first); picking one turns the row into a transfer, writes the other side and highlights it.
- **To categorise:** an amber banner says how many rows have no category, so totals are incomplete, with **Show
  them**. An empty inbox says so ("All sorted").
- **Rule prompt:** sorting imported rows by hand (one row or a bulk pick) asks "Always put *ΒΑΣΙΛΟΠΟΥΛΟΣ* in
  *Σούπερ μάρκετ*?" (several merchants: "«Α», «Β» and 2 more … One rule each") in a bar **pinned to the bottom of
  the window**, so a long list keeps its scroll position. **Always** saves one rule per merchant and sorts their other
  waiting rows; merchants a rule already puts in that category are not asked about. Esc / *Not now* dismisses; the
  "saved" note closes itself after 5 s.
- **Subscription hint:** when a merchant charges about the same every month or year (3+ times), an info banner
  offers **Review**: sort it under a Subscriptions category (and learn a rule) or mark it "Not a subscription".

## Categories

- Two levels: a group (Bills, Spending…) with categories. The **type** (`INCOME`, `BILL`, `SUBSCRIPTION`,
  `EXPENSE`, `DEBT`, `SAVINGS`) is set on the group; its categories follow it.
- An empty database gets a Greek (or English) starter set, one group per type, plus common Greek merchant rules
  (ΔΕΗ, COSMOTE, NETFLIX, ΣΚΛΑΒΕΝΙΤΗΣ, LIDL, SHELL…), in the app language of that moment.
- Pickers search by name and group, ignoring accents and Greek/Latin script; income rows offer income groups, the
  rest offer everything else; the subscription hint offers only Subscriptions.
- Renaming, reordering, moving, merging, archiving and deleting categories, and editing merchant rules:
  [category management](categories.md) (**Manage categories** in the page header).

## Behaviour

- Expense `< 0`, income `> 0`, in cents. A transfer is two rows sharing `transferId`, written in one database
  transaction; editing it rewrites both sides; deleting a hand-entered side deletes both, but an imported side
  stays as a plain row to categorise.
- Two opposite rows in different accounts can be linked into a transfer (`transaction:linkTransfer`); their
  categories are cleared.
- One saved row becomes a transfer with `transaction:makeTransfer`: its category and member are cleared and the other
  side is written with the opposite amount, same date and text, in the row's import (undo removes both).
- Imported rows keep their bank text and fingerprint when edited, so the next statement still recognises them.
- **Rules:** a pattern is stored folded like `payeeKey()` (no accents, digits or "POS"/"ΑΓΟΡΑ"), matches whole
  words, and a learned rule (priority 1000) beats the seeded list. The same pattern again updates the rule.
- **Subscription hints:** same merchant, amount within ±10% of the latest, steps of 26–35 days (monthly) or
  350–380 days (yearly), at least 3 charges, the latest within two intervals of today. Merchants already in a
  Subscriptions, Bills, Debt or Savings category are skipped; dismissed ones are remembered on this computer.
- **Search and sort** run over every row the filters match, not just the page. Date and amount sorts page in SQL;
  a search or a description/category sort loads the filtered rows' few text fields, matches them with `normalise()`,
  orders them with a Greek collator (ties newest first), then loads one page in full. Totals follow the search.

## Code

| Path | Role |
| --- | --- |
| `src/main/services/transactions.ts` | List (filters, search, sort, pagination, totals), create, update, set category, transfers, delete, payees |
| `src/main/services/transaction-search.ts` | Search matcher and column sort of the log |
| `src/main/services/categories.ts`, `seed.ts` | Category tree, create/update/archive; starting categories and rules |
| `src/main/services/rules.ts` | Rule list/create/update/delete; apply a new rule to waiting rows |
| `src/main/services/subscriptions.ts`, `import/subscription-detect.ts` | Subscription hints |
| `src/renderer/src/pages/TransactionsScreen.tsx` | Log page, banners, import landing |
| `src/renderer/src/components/transactions/` | `TransactionForm`, `TransactionList`, `TransactionFilters`, `CategoryPicker` (shared picker, inline create) |
| `src/renderer/src/lib/category-target.ts` | Transfer options and values inside a category picker |
| `src/renderer/src/components/subscriptions/SubscriptionHints.tsx` | Hint review dialog |
| `src/renderer/src/components/ui/DateInput.tsx` | Date field in the Settings format |
| `src/renderer/src/store/transactions.ts` | Filter, search, sort, page, selection |
| `src/shared/ledger.ts`, `src/shared/payee-key.ts` | Shapes; merchant key and display text |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `transaction:list` | `(TransactionFilter)` → `TransactionPage` | `INVALID_INPUT` |
| `transaction:payees` | `()` → `PayeeSuggestion[]` | — |
| `transaction:create` / `:update` | `(input)` / `(id, input)` | `INVALID_INPUT`, `INVALID_AMOUNT`, `ACCOUNT_NOT_FOUND`, `CATEGORY_REQUIRED`, `CATEGORY_NOT_FOUND`; update adds `TRANSACTION_NOT_FOUND`, `TRANSACTION_IS_TRANSFER` |
| `transaction:setCategory` | `(ids, categoryId)` → count | `INVALID_INPUT`, `CATEGORY_NOT_FOUND` |
| `transaction:setPayee` | `(ids, payee)` → count; a hand-entered row's description follows | `INVALID_INPUT` |
| `transaction:createTransfer` / `:updateTransfer` | `(input)` / `(transferId, input)` | `INVALID_INPUT`, `INVALID_AMOUNT`, `SAME_ACCOUNT`, `ACCOUNT_NOT_FOUND`; update adds `TRANSACTION_NOT_FOUND`, `TRANSFER_IMPORTED` |
| `transaction:linkTransfer` | `(idA, idB)` → transferId | `TRANSACTION_NOT_FOUND`, `TRANSFER_MISMATCH` |
| `transaction:makeTransfer` | `(id, otherAccountId)` → transferId | `TRANSACTION_NOT_FOUND`, `TRANSFER_MISMATCH`, `SAME_ACCOUNT`, `ACCOUNT_NOT_FOUND`, `VOUCHER_NO_TRANSFER_OUT` |
| `transaction:delete` | `(id)` | `TRANSACTION_NOT_FOUND` |
| `category:list` / `:create` / `:update` | tree; `(input)`; `(id, input)` | `INVALID_INPUT`, `CATEGORY_NOT_FOUND`, `CATEGORY_EXISTS` |
| `category:manage` / `:archive` / `:move` / `:reorder` / `:merge` / `:delete` | see [category management](categories.md#ipc) | |
| `rule:list` / `:create` / `:update` / `:delete` | `RuleSummary[]`; `(RuleInput)` → `{ id, appliedCount }`; `(id, patch)`; `(id)` | `INVALID_INPUT`, `CATEGORY_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `RULE_NOT_FOUND` |
| `subscription:hints` | `()` → `SubscriptionHint[]` | — |

## Tests

`src/main/__tests__/ledger-services.test.ts` (signs, validation, month filter, groups, pagination, bulk category,
bulk payee, payees, transfers, linking and row → transfer), `rules.test.ts`, `services/import/subscription-detect.test.ts`, and the subscription
case in `statement-import.test.ts`; `lib/ledger.test.ts` (entry validation and defaults, pickers, transfer accounts, rule-prompt merchants), `lib/category-target.test.ts`,
`shared/date-format.test.ts` and the `DateInput`, `MenuList` and `RulePrompt` blocks in `components/ui/ui.test.tsx`.
