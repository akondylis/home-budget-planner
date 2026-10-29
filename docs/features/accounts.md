# Accounts & cards

**User's job:** see what each bank account, card and the cash in the wallet holds right now, whose it is and which
cards draw on it, and know where its numbers come from (a statement, or entered by hand).

## UX

- **Entry point:** sidebar › **Accounts & cards**. Without any account, the page *is* Quick setup, and **Add
  transaction** (`Ctrl+N`) or **Import statement** brings the user here first.
- **Quick setup:** the five usual accounts, pre-filled and ticked: Alpha Bank account, Alpha Bank card, Eurobank
  account, Eurobank card and Cash. Each row asks "how much is in it now" (a card: how much is owed); untick what the
  household does not have. One primary button creates them all in one write.
- **Account card:** name, kind and bank; the balance (a card's says "negative = owed"); where the data comes from:
  "Imported up to 09/10/2026" (a link to that account's past imports), "Not imported yet" or "Entered by hand"
  (cash); the row count.
- **Holder and cards on the account card:** under kind · bank, the holder has its own line (dot and name, or
  "Joint" once parents exist), so the bank never truncates; a quieter line lists the cards,
  `•••• 1234 Ανδρέας · •••• 5678 Μαρία`.
- **Account form:** after name, kind and bank (the user's bank list, with **+ New bank…** to add one on the spot,
  see [banks.md](banks.md)) come **Holder** (Joint, then each parent; hidden without parents) and
  **Cards** (not for cash): rows of last 4 digits + holder + remove, then **Add card**. A new card's holder is the
  account's holder, else the parent using the app; focus goes to its digits. Wrong digits or a repeat show on that
  row. Everything is saved by the form's one primary button; Cancel drops card changes.
- **Actions per card:** bank accounts and cards lead with **Import statement**, then **Add transaction**; cash has
  only **Add transaction**. Header icons: the account's transactions, and edit.
- **Page header:** total across active accounts as the context line; **New account** becomes the primary button
  once Quick setup is done. With a filter on it reads "Total shown: … • 3 of 7 accounts", so the number never
  silently changes meaning.
- **Group by and filters** (from two accounts on, under the header; the filters follow Matchday's pattern):
  **Group by** None · Bank · Holder · Type on the left, **Filters (n)** on the right. The popover has **Type**,
  **Bank** and **Holder** sections of on/off chips, each with its account count (holders with their dot); any of
  the chosen values in a section, every section with a choice. Each chosen value shows as a removable pill under
  the toolbar, with **Clear all**. Each group gets a `SectionHeader`: icon or the parent's dot, name, account count
  and its subtotal; inside a group the card drops what the header already says. Banks follow the order set in
  Settings › Banks ("No bank" last, see [banks.md](banks.md)); types keep their declared order; holders follow the
  members' order, Joint last. A section appears only
  with two or more values; Holder only once parents exist. Nothing matching shows an empty state with **Clear
  all**. The grouping is remembered on this PC; filters last for the session (Back returns to them) and never
  survive a restart. The archived list is not filtered.
- **Archive, not delete:** an archived account leaves the grid and every picker, keeps its rows, and comes back
  from the "Archived (n)" list under the grid.

## Behaviour

- **Balance** = opening balance + every transaction of the account (`balanceOn()` gives it at the end of any day,
  for the statement balance check).
- **Signs:** money in the account is positive; a credit card's debt is negative, so paying it off is a transfer
  from the bank account that brings it towards zero.
- **Opening date:** the day the opening balance is true. Rows dated before it still count towards the balance.
- **Import settings live on the account:** `importProfile` (bank preset, from bank and kind) and `importMapping`
  (columns the user mapped once for a file no preset knew); see [statement-import.md](statement-import.md).
- **Imported up to** = the latest `dateTo` of the account's imports that were not undone.
- **Holder** (`holderMemberId`, null = joint) is shown only; it never sets who an imported row is **For**
  (decided 2026-10-27). An archived parent stays on accounts and cards that already name them, but cannot be
  newly chosen.
- **Cards** (`Card`): debit cards on a current account, main and supplementary cards on a credit card account.
  `account:create` / `account:update` take the whole list and sync it in one write (add, change, remove, order;
  two cards may swap digits). Left out = cards untouched (Quick setup). An account switched to cash drops its
  cards. Card limit, statement and due day were dropped for now (2026-10-27); reading the card in statement text
  is roadmap #19.
- **Holder filter** matches the account's holder **or** a card holder on it (a parent's card on a joint account
  counts as theirs); **grouping by holder** uses the account's holder only. A stored choice whose dropdown is no
  longer shown (one bank left, parents removed) is ignored rather than hiding accounts.
- **Cash** is an account of kind `CASH`: no statement, every row typed in. ATM withdrawals are transfers into it,
  so cash spending is counted once, when it is entered.

## Code

| Path | Role |
| --- | --- |
| `src/main/services/accounts.ts` | List with balances and "imported up to", create (one or many), update, archive, `balanceOn` |
| `src/main/ipc/account.ts` | Thin handlers |
| `src/renderer/src/pages/AccountsScreen.tsx` | Grid (grouped or not), archived list, form |
| `src/renderer/src/components/accounts/` | `AccountCard`, `AccountsToolbar`, `AccountForm`, `BankPicker`, `CardListEditor`, `QuickSetup` |
| `src/renderer/src/lib/account-groups.ts` | Filter, group with subtotals, values offered with counts, filter as applied, pills |
| `src/renderer/src/store/ui.ts` | `accountsGroupBy` (persisted), `accountsFilter` (session) |
| `src/renderer/src/store/ledger.ts` | Accounts, categories and payees for every screen; `changed()` after each write |
| `src/renderer/src/lib/ledger.ts` | `QUICK_SETUP`, account icons, `parseAccountDraft` (cards included) |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `account:list` | `({ includeArchived? })` → `AccountSummary[]` | — |
| `account:create` | `(AccountInput)` → id (holder and cards included) | `INVALID_INPUT`, `INSTITUTION_NOT_FOUND`, `MEMBER_NOT_FOUND`, `CARD_DUPLICATE` |
| `account:createMany` | `(AccountInput[])` → ids (Quick setup, one write) | `INVALID_INPUT`, `INSTITUTION_NOT_FOUND`, `MEMBER_NOT_FOUND` |
| `account:update` | `(id, AccountInput)` → `void`; syncs the card list when given | `INVALID_INPUT`, `ACCOUNT_NOT_FOUND`, `INSTITUTION_NOT_FOUND`, `MEMBER_NOT_FOUND`, `CARD_DUPLICATE`, `CARD_NOT_FOUND` |
| `account:archive` | `(id, archived = true)` → `void` | `ACCOUNT_NOT_FOUND` |

## Tests

`src/main/__tests__/ledger-services.test.ts` (accounts: order, balance without rows, validation, archive keeps
rows, missing account; holders and cards: list order, sync with swapped digits, duplicate / foreign card / unknown
holder, archived holder kept), `lib/ledger.test.ts` (account draft parsing with cards, default account) and
`lib/account-groups.test.ts` (filters: any within a section, card holders, Joint; group order and subtotals; filter as applied; pills).
