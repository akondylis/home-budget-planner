# Meal-voucher cards

**User's job:** keep the employer's meal cards (Edenred Ticket Restaurant, Up Hellas) in the budget, so food
spending shows what the family really eats, without the card balance looking like money that can pay any bill.
Starts at sidebar › **Accounts & cards** › **New account** › kind **Meal-voucher card**.

## UX

- **Account form:** choosing the kind narrows **Issued by** to Edenred, Up Hellas or Other (Edenred first) and
  makes **Holder** required, without **Joint**: the card comes from one parent's employer (the parent using the
  app is pre-picked). The opening balance hint asks for what the provider's app shows today; the card row takes
  the last 4 digits.
- **Account card:** fork-and-knife icon, "Voucher balance", a **Food only** badge (tooltip: not counted in the
  total) and, below zero, a **Below zero** warning badge. Source line "Entered by hand", as for cash;
  only **Add transaction**, no import.
- **Page header:** the accounts total leaves voucher balances out and adds them beside it:
  "Total of all accounts: €2.340,00 • Meal vouchers: €230,00" (also in the filtered "Total shown" line).
- **Top-up:** Add income, account = the card, category **Meal vouchers** (the payee default remembers it after the
  first time).
- **Spending:** an ordinary expense in Groceries or Eating out. If it takes the card below zero, the account
  field shows an amber warning with the resulting balance; saving still works (a top-up or the opening balance may
  simply be missing).
- **Transfers:** a voucher card is not offered as **From**; switching to Transfer from a card moves **From** to the
  first other account. It can still be **To** (a correction), though never picked by default.

## Behaviour

- Kind `MEAL_VOUCHER`, institutions `EDENRED` / `UP_HELLAS` (SQLite stores enums as text: no migration).
- Main-process rules (`VOUCHER_NO_TRANSFER_OUT`, `HOLDER_REQUIRED`, issuer check) hold whatever the renderer sends.
  The holder is required only once at least one active parent exists.
- **Meal vouchers** income category: a starter category in new databases; for older ones it is created under the
  first income group (or that group too) when the first voucher card is saved, or an archived one of that name is
  brought back. Never duplicated.
- Statement import never pairs a transfer with a voucher card's rows.
- `isSpendable(kind)` (`src/shared/ledger.ts`) is the one place that decides what counts as spendable money; use it
  for future Overview tiles and projections.

## Code

| Path | Role |
| --- | --- |
| `src/shared/ledger.ts` | `MEAL_VOUCHER`, `EDENRED`/`UP_HELLAS`, `VOUCHER_INSTITUTIONS`, `isSpendable` |
| `src/main/services/accounts.ts` | issuer check, `assertVoucherHolders`, top-up category on save |
| `src/main/services/seed.ts` | `meal_vouchers` starter, `ensureVoucherCategory` |
| `src/main/services/transactions.ts` | no transfer out of a card (create, edit, link) |
| `src/main/services/import/import-service.ts` | voucher rows left out of transfer pairing |
| `src/renderer/src/lib/ledger.ts` | `isImportable`, `canSendTransfer`, `voucherShortfall`, holder check in `parseAccountDraft` |
| `components/accounts/AccountForm.tsx`, `AccountCard.tsx`, `pages/AccountsScreen.tsx` | form, badges, totals |
| `components/transactions/TransactionForm.tsx` | From picker, overdraw warning |

## Tests

- `src/main/__tests__/ledger-services.test.ts` › *meal-voucher cards*: issuer and holder rules, top-up category
  once (and restored when archived), no transfer out by create, edit or link.
- `src/renderer/src/lib/ledger.test.ts`: importable/sender kinds, default transfer target, shortfall (edited row
  counted once), holder error in the account draft.
