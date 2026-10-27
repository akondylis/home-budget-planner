# Members

**User's job:** say once who the parents are. After that, every entry records who entered it and who it was for,
and nobody has to type it again. Children are not tracked ("children included?" was answered 2026-10-27).

## UX

- **Entry points:**
  - Settings › **Household**, the first section on that page.
  - Overview setup step 1, **Add the parents** › **Household**.
  - The sidebar chip, which reads **Add parents** when there are none yet.
  - `Ctrl+K` › "Household".
- **Household section:** one row per parent, with a colour dot, the name, a **This PC** badge on the parent using
  this computer, and the row count as quiet meta.
  - Row actions: **Use on this PC**, edit and archive.
  - **Add parent** is the section's single primary button.
  - The form asks for the name first (inline errors, a duplicate name included), then a colour. The colour starts
    on the first one not in use.
- **Who is using the app:** a chip at the foot of the sidebar shows the current parent (dot and name). Clicking it
  opens a menu with each parent (a check on the current one) and **Manage household**.
  - When the sidebar is collapsed, the chip shows the initial and a hover card gives the name.
  - With two parents and none picked yet, the chip reads **Who is using the app?** in amber.
  - A lone parent is picked automatically.
  - `Ctrl+K` also has "Use the app as <name>".
  - The tour has a step for the chip.
- **For** (transaction form, expense and income only): a toggle with **Household** first, then each parent.
  - The default is the payee's last choice, otherwise Household.
  - It is hidden while there are no parents.
  - When editing a row, a quiet line reads "Entered by <name>".
- **Log:**
  - The meta line starts with "for <name>" when the row is for a parent.
  - A **For** filter offers anyone, Household or one parent.
  - The bulk bar has **Set "For"…**. Imported rows arrive as Household, and this sorts them.
- **Archive, not delete:** an archived parent disappears from pickers and from the chip, but keeps their name on
  past rows. They come back from "Archived parents (n)". A restore is refused if another active parent has
  taken the name.
- **Colour is never the only cue:** the dot always sits next to the name or initial.

## Behaviour

- **Who is using the app is stored per PC** (`ui-prefs` in localStorage, `currentMemberId`), not in the
  database. On a shared PC each parent switches, and multi-PC use is still undecided.
- **`createdByMemberId`** is set once, when a row is created: by hand, by a transfer (both sides) or by an import
  (the batch and every row it writes). An edit never changes it. An archived parent is still accepted here.
- **`memberId`** = who the row was for. `null` = the household (shared).
  - Transfers never carry one, because they are not spending.
  - `setMember` skips transfers.
  - An archived or unknown parent gives `MEMBER_NOT_FOUND`.
- **Names are unique among active parents**, ignoring case and accents (`normalise()`).
- **Colours** are palette keys (`MEMBER_COLOURS`). The renderer maps them to theme classes (`MEMBER_DOT_CLASS`),
  so they change with light and dark mode.
- **Next:** #2 (account holders) will default **For** on imported card rows to the card's holder.

## Code

| Path | Role |
| --- | --- |
| `src/shared/members.ts` | `MemberSummary`, `MEMBER_COLOURS`, `HOUSEHOLD`, `nextFreeColour` |
| `src/main/services/members.ts` | List with counts, create, update, archive and restore, `assertMember` |
| `src/main/services/transactions.ts` | `memberId` and `createdByMemberId` on create, update, filter and payee suggestions; `setMember` |
| `src/main/services/import/import-service.ts` | `commitImport` stamps `createdByMemberId` |
| `src/main/ipc/member.ts` | Thin handlers |
| `src/renderer/src/components/members/` | `HouseholdSection`, `MemberForm`, `MemberSwitcher` (sidebar chip), `MemberDot` |
| `src/renderer/src/lib/members.ts` | `resolveCurrentMember`, `MEMBER_DOT_CLASS`, `initialOf` |
| `src/renderer/src/store/ui.ts` · `store/ledger.ts` | `currentMemberId` (per PC) · `members` (reconciled after each load) |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `member:list` | `({ includeArchived? })` → `MemberSummary[]` | — |
| `member:create` | `(MemberInput)` → id | `INVALID_INPUT`, `MEMBER_NAME_TAKEN` |
| `member:update` | `(id, MemberInput)` → `void` | `INVALID_INPUT`, `MEMBER_NOT_FOUND`, `MEMBER_NAME_TAKEN` |
| `member:archive` | `(id, archived = true)` → `void` | `MEMBER_NOT_FOUND`, `MEMBER_NAME_TAKEN` (restore) |
| `transaction:setMember` | `(ids, memberId \| null)` → count | `INVALID_INPUT`, `MEMBER_NOT_FOUND` |

## Tests

- `src/main/__tests__/members.test.ts`:
  - Members: order and counts, validation, duplicate names, archive and restore, next colour.
  - Rows: for and entered by, edit keeps the stamp, archived member rules, filters, `setMember`, transfers,
    the payee default.
- `statement-import.test.ts`: the import stamp.
- `lib/members.test.ts`: the current-member rules.
- `components/members/MemberDot.test.tsx`.
