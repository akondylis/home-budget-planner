# Category management

**User's job:** keep the category list matching how the household thinks about money, and make sure imports land in
the right category — fix a wrong merchant rule in seconds instead of re-sorting every statement. Starts from
**Manage categories** on the Transactions page (also Settings and `Ctrl+K`).

## UX

- **Entry points:** **Manage categories** (ghost, `tag`) in the Transactions header; Settings › **Categories**;
  `Ctrl+K` › "Categories" or "Merchant rules". The page is not in the sidebar (Transactions stays highlighted); the
  back button returns to the page it came from, with the log's filter intact.
- **Tabs:** **Categories · Merchant rules** (`Segmented`); each tab has one primary button.
- **Categories tab:** one card per group in type order: name (pencil → inline rename, Enter saves, Esc cancels,
  name clash shown under the field), type badge, ↑/↓ among groups of the same type, and a **More** menu (change name
  or type, archive group, delete — disabled with the reason while it has categories).
  - Category rows: name, "42 transactions • 3 rules", ↑/↓, and **More**: *Show transactions* (opens the log
    filtered to it, all months), *Move to group…*, *Merge into…*, *Archive*, *Delete* (disabled with "Has
    transactions: merge or archive it instead").
  - **Add category** at the foot of each group (inline field); **New group** is the primary button.
  - **Archived (n)** at the bottom with **Restore** per row; an archived group stands for its categories.
- **Change type** (group dialog): "Counts as" select; when rows exist the hint says "120 transactions will count as
  Bills".
- **Move to group…:** group picker; if the type changes, "Its 12 transactions will count as Bills instead of
  Spending". A name the group already has → the error plus **Merge into the existing one instead**.
- **Merge into…:** searchable category picker (the source left out), then "12 transactions and 2 rules move to
  *Καφετέριες*. *Καφέδες* is archived." Primary **Merge**; a success banner repeats the counts.
- **Merchant rules tab:** search (pattern, payee, category; accents and Greek/Latin ignored), category filter,
  **All / Yours / Starter**. Rows: pattern (mono) → category, a *Starter* badge, then match kind, "shown as …",
  account or "All accounts", "used 5 times"; edit (pencil) and delete (trash, "Rows keep their category; only
  future imports change").
- **Add rule / edit:** bank text (the stored, folded form is shown under it: "Matched as “sklavenitis”"), match
  (Contains / Starts with / Exactly), category, payee name, accounts; a new rule offers "Also sort the rows still
  waiting…" (on by default) and reports how many it sorted.
- **States:** empty group ("No categories in this group yet."), no rules (explains they are learned from "Always put
  X in Y?"), no search match (with **Clear all**), errors in red under the list or field; the item just saved is
  highlighted.

## Behaviour

- **Archive** hides a category from pickers; its rows keep it and still count in totals. A group takes its active
  categories with it. **Restore** brings back the category's group too; restoring a group brings back the
  categories archived with it (same moment), not ones archived earlier.
- **Move** gives the category the new group's type and puts it last there. Groups never move under another group.
- **Merge** A → B, in one database transaction: rows and rules move to B, a rule B already has (same pattern,
  account and match) is dropped, and A is archived (decided 2026-10-28). Merging into a group is refused.
- **Delete** only when no row uses the category (its rules are deleted with it), or a group has no categories at
  all (archived ones included). Otherwise `CATEGORY_IN_USE`.
- **Names:** the unique index also covers archived categories, so a rename or move onto the name of an archived
  category that nothing uses removes that empty one; one that still holds rows blocks it (`CATEGORY_EXISTS`).
- **Order:** ↑/↓ rewrite `sortOrder` of the siblings in one transaction; groups only reorder within their type.
- **Rules:** a rule's account can be changed or cleared ("All accounts"); *Yours* = priority ≥ 1000 (taught in the
  app), *Starter* = the seeded merchant list.

## Code

| Path | Role |
| --- | --- |
| `src/main/services/categories.ts` | Tree with counts, create/update, archive/restore, move, reorder, merge, delete |
| `src/main/services/rules.ts` | Rule list (account name, learned), create/update (account scope)/delete |
| `src/renderer/src/pages/CategoriesScreen.tsx` | Page, back button, tabs |
| `src/renderer/src/components/categories/` | `CategoriesTab`, `CategoryGroupCard`, `InlineName`, `GroupForm`, `MoveCategoryDialog`, `MergeCategoryDialog`, `RulesTab`, `RuleForm` |
| `src/renderer/src/components/ui/ActionMenu.tsx` | "More" menu for row actions (↑/↓, Enter, Esc; disabled items show why) |
| `src/renderer/src/lib/categories.ts` | Archived split, reorder, rule search and filters, pattern preview |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `category:manage` | `()` → `ManagedCategoryNode[]` (archived included, row and rule counts) | — |
| `category:archive` | `(id, archived)` | `INVALID_INPUT`, `CATEGORY_NOT_FOUND`, `CATEGORY_EXISTS` |
| `category:move` | `(id, parentId)` | `INVALID_INPUT`, `CATEGORY_NOT_FOUND`, `CATEGORY_EXISTS` |
| `category:reorder` | `(parentId \| null, orderedIds)` | `INVALID_INPUT` |
| `category:merge` | `(sourceId, targetId)` → `{ transactions, rules }` | `INVALID_INPUT`, `CATEGORY_NOT_FOUND` |
| `category:delete` | `(id)` | `INVALID_INPUT`, `CATEGORY_NOT_FOUND`, `CATEGORY_IN_USE` |
| `rule:update` | `(id, patch)`; the patch may set `accountId` | adds `ACCOUNT_NOT_FOUND` |

`category:list` / `:create` / `:update` and the other `rule:*` channels are in [transactions](transactions.md#ipc).

## Tests

`src/main/__tests__/categories.test.ts` (counts, move and type, name clashes with archived twins, reorder, merge with
a duplicate rule, restore with group, delete rules), `rules.test.ts` (account scope, learned flag),
`src/renderer/src/lib/categories.test.ts` (archived split, reorder, rule search across scripts, filters), and the
`ActionMenu` block in `components/ui/ui.test.tsx`.
