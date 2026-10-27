# Accounts & cards

**User's job:** see what each bank account, card and the cash in the wallet holds right now, and know where its
numbers come from (a statement, or entered by hand).

## UX

- **Entry point:** sidebar › **Accounts & cards**. Without any account, the page *is* Quick setup, and **Add
  transaction** (`Ctrl+N`) or **Import statement** brings the user here first.
- **Quick setup:** the five usual accounts, pre-filled and ticked: Alpha Bank account, Alpha Bank card, Eurobank
  account, Eurobank card and Cash. Each row asks "how much is in it now" (a card: how much is owed); untick what the
  household does not have. One primary button creates them all in one write.
- **Account card:** name, kind and bank; the balance (a card's says "negative = owed"); where the data comes from:
  "Imported up to 09/10/2026" (a link to that account's past imports), "Not imported yet" or "Entered by hand"
  (cash); the row count.
- **Actions per card:** bank accounts and cards lead with **Import statement**, then **Add transaction**; cash has
  only **Add transaction**. Header icons: the account's transactions, and edit.
- **Page header:** total across active accounts as the context line; **New account** becomes the primary button
  once Quick setup is done.
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
- **Cash** is an account of kind `CASH`: no statement, every row typed in. ATM withdrawals are transfers into it,
  so cash spending is counted once, when it is entered.

## Code

| Path | Role |
| --- | --- |
| `src/main/services/accounts.ts` | List with balances and "imported up to", create (one or many), update, archive, `balanceOn` |
| `src/main/ipc/account.ts` | Thin handlers |
| `src/renderer/src/pages/AccountsScreen.tsx` | Grid, archived list, form |
| `src/renderer/src/components/accounts/` | `AccountCard`, `AccountForm`, `QuickSetup` |
| `src/renderer/src/store/ledger.ts` | Accounts, categories and payees for every screen; `changed()` after each write |
| `src/renderer/src/lib/ledger.ts` | `QUICK_SETUP`, account icons, `parseAccountDraft` |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `account:list` | `({ includeArchived? })` → `AccountSummary[]` | — |
| `account:create` | `(AccountInput)` → id | `INVALID_INPUT` |
| `account:createMany` | `(AccountInput[])` → ids (Quick setup, one write) | `INVALID_INPUT` |
| `account:update` | `(id, AccountInput)` → `void` | `INVALID_INPUT`, `ACCOUNT_NOT_FOUND` |
| `account:archive` | `(id, archived = true)` → `void` | `ACCOUNT_NOT_FOUND` |

## Tests

`src/main/__tests__/ledger-services.test.ts` (accounts: order, balance without rows, validation, archive keeps
rows, missing account) and `lib/ledger.test.ts` (account draft parsing, default account).
