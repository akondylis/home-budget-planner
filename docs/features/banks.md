# Banks

**User's job:** put an account at the bank where it really is (Revolut, Piraeus, NBG, a meal-card issuer) without
waiting for an app update, and see the Accounts page grouped and filtered by those banks in the household's own
order. Starts in the account form's **Bank** picker, or in Settings › **Banks**.

## UX

- **Starter list:** a fresh install already lists Alpha Bank, Eurobank, Piraeus Bank, National Bank (NBG), Revolut,
  Optima bank, Viva Wallet, Attica Bank, and the meal-card issuers Edenred and Up Hellas (decided 2026-10-29).
- **Account form:** **Bank** offers **No bank**, the active banks in the user's order, and last **+ New bank…**.
  Picking it turns the select into a full-width **New bank** name field with **Add** and ✕; `Enter` adds the bank
  (it does not save the account), `Esc` goes back to the list. The bank added is selected, so the job never leaves
  the form. A taken name shows under the field. For a meal-voucher card the label is **Issued by**, the list holds
  issuers only and the last option is **+ New issuer…**.
- **Settings › Banks** (after Household; `Ctrl+K` › **Manage banks** scrolls to it): each bank with its icon, its
  type when it is a meal-card issuer and its account count; ↑ / ↓ to reorder, edit, archive. **Add bank** opens a
  small dialog: name and **Type** (Bank · Meal-card issuer). The type is locked, with the reason as hint, while
  accounts use the bank. Archived banks sit under "Archived banks (n)" with **Restore**.
- **Accounts page:** **Group by › Bank** and the **Bank** filter chips list only banks that hold an account, by
  their name, in the Settings order, **No bank** last. Account cards name their bank under the kind.

## Behaviour

- `Institution` is a table: `name` (unique, also ignoring case and accents), `kind` (`BANK` / `VOUCHER_ISSUER`),
  `statementPreset`, `sortOrder`, `archivedAt`. `Account.institutionId` null = no bank (replaced the old `OTHER`).
- **Archive, never delete:** an archived bank leaves the pickers; accounts already at it keep it (name, group,
  filter chip) and can still be saved with it.
- **Kind rules** hold in the main process: a meal-voucher card takes a voucher issuer or none, every other account a
  bank or none (`INVALID_INPUT`). Changing a bank's type is refused while an account of the other kind uses it
  (`INSTITUTION_IN_USE`). Switching an account's kind in the form keeps its bank while it fits, else picks the
  first issuer (meal card) or no bank.
- **Statement presets** follow `statementPreset` (`alpha`, `eurobank`, `piraeus`, `revolut`), not the bank's name,
  so renaming Alpha Bank keeps its preset. Piraeus and Revolut got theirs in `20261030140000_bank_statement_presets`
  (by id). A bank without one (NBG, any bank added) uses the generic reader and the column map saved on the
  account, as "Other" did before.
- **Order:** ↑ / ↓ swaps among the active banks and renumbers them from 0. Groups and chips use this order; a bank
  missing from the list sorts after the listed ones.
- **Migration** `20261029120000_institutions_table` (hand-written) creates the list with fixed ids (`inst_alpha`,
  `inst_eurobank`, `inst_edenred`, `inst_up_hellas`, …) and maps every existing account: `ALPHA`, `EUROBANK`,
  `EDENRED`, `UP_HELLAS` to those ids, `OTHER` to no bank. Quick setup refers to `inst_alpha` / `inst_eurobank`
  and leaves the bank off if the user archived it. A saved Accounts filter that still holds an old enum value is
  ignored (the value no longer occurs).

## Code

| Path | Role |
| --- | --- |
| `src/main/services/institutions.ts` | List with account counts, create, update, archive/restore, move; `assertInstitution` for accounts |
| `src/main/ipc/institution.ts` | Thin handlers |
| `src/renderer/src/components/banks/` | `BanksSection` (Settings), `BankForm` (dialog) |
| `src/renderer/src/components/accounts/BankPicker.tsx` | Bank select with inline **New bank…** |
| `src/renderer/src/lib/banks.ts` | `banksFor` (picker options), `bankAfterKindChange` |
| `src/renderer/src/lib/account-groups.ts` | Groups and chips keyed by bank id, `NO_BANK`, ordered by the list |
| `src/renderer/src/store/ledger.ts` | `institutions` (archived included), reloaded by `changed()` |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `institution:list` | `({ includeArchived? })` → `InstitutionSummary[]` | — |
| `institution:create` | `({ name, kind })` → id (added last) | `INVALID_INPUT`, `INSTITUTION_NAME_TAKEN` |
| `institution:update` | `(id, { name, kind })` → `void` | `INVALID_INPUT`, `INSTITUTION_NOT_FOUND`, `INSTITUTION_NAME_TAKEN`, `INSTITUTION_IN_USE` |
| `institution:archive` | `(id, archived = true)` → `void` | `INSTITUTION_NOT_FOUND` |
| `institution:move` | `(id, 'up' \| 'down')` → `void` | `INVALID_INPUT`, `INSTITUTION_NOT_FOUND` |

## Tests

`src/main/__tests__/institutions.test.ts` (starter list, add and use, taken names incl. archived, kind lock,
archive keeps accounts, move, account kind rules), `institutions-migration.test.ts` (old enum values carried over),
`lib/banks.test.ts` (picker options, bank after a kind change), `lib/account-groups.test.ts` (user order, added and
unlisted banks, No bank last, old saved filter values dropped, pills by name).
