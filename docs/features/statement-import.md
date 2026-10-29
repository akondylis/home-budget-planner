# Statement import

**User's job:** get this month's bank and card movements into the budget once, correctly sorted, in under a
minute, with no fear of doubles. Supported first: Alpha Bank and Eurobank, accounts and cards, as CSV.

## UX

- **Entry points:** **Import statement** on each bank/card account card (account pre-selected), on the
  Transactions header, and `Ctrl+K`. Past imports: the "Imported up to…" link on an account card, the wizard, `Ctrl+K`.
- **Step 1, account + file:** the account (bank accounts and cards; cash has no statement) and **Choose statement
  file…** (primary), which opens the Windows file dialog and reads the file at once. A lock line says the file is
  read on this computer and never sent anywhere.
- **Step 2, which column is which** (only when no preset knows the file): the first rows as a table, the row with
  the column names (guessed), date, description, one signed amount or money out/in columns, optional balance, date
  order, number style, and "purchases are positive" (ticked for cards). The account keeps the mapping.
- **Step 3, review:** context line *account · file · period · Detected: Alpha Bank account*. Chips filter the
  table: *9 all · 8 new · 1 unreadable · 4 to categorise*. Each row: tick, date, bank text with a reason line
  ("Rule: Σκλαβενίτης", "As last time", "Imported before"…), **Goes to** (a category picker, or a transfer/link
  choice), signed amount, status badge (text + colour). Primary: **Import 8 transactions**, live; **Nothing new to
  import** (disabled) when every row is known. The same file again shows an info banner with when it was imported.
- **Learning:** picking a category asks "Always put *ΚΑΦΕ ΜΙΚΡΟ ΚΗΦΙΣΙΑ* in *Φαγητό έξω*?"; **Always** saves a
  rule and gives that category to the other rows of the merchant (not to rows sorted by hand or by another rule).
- **New category on the spot:** typing a name the picker does not know offers **Create «Οπωροπωλείο»** (↓ + Enter
  reaches it); a small dialog asks for the group and the new category is used for that row straight away.
- **After import:** the log, filtered to that import, with "8 imported · 1 to categorise · Balance matches the
  bank", **Undo import** and **Show all**. If the statement's balance differs, an amber banner gives both amounts,
  the difference and where to look. It warns, never blocks.
- **Past imports:** file, account, period, when, rows, a balance badge (matches / differs by €x), **Show its rows**
  and **Undo** (with a confirm). Undone imports stay listed.
- **Errors:** an unreadable or too large file, a file with no movements ("choose the statement export") and an
  expired preview (**Read again**) are explained in place.

## Behaviour

Each row ends with one status, from exact to fuzzy:

| Status | When | Starts as |
| --- | --- | --- |
| `ALREADY_IMPORTED` | Same bank reference, or same fingerprint: account, date, cents, bank text and its occurrence number inside the file | Not selectable |
| `POSSIBLE_DUPLICATE` | A hand-entered row in the account, same amount, ±3 days | Unticked; ticking **links** it (one row); a category = import anyway |
| `TRANSFER_MATCH` | The opposite amount in another own account, ±5 days, not yet paired | Paired as a transfer |
| `NEW` | Anything else | Ticked, with the rule or last-used category |
| `INVALID` | Date or amount unreadable (the reason names the line) | Not selectable |

- Two identical €2,50 coffees on one day are occurrence 1 and 2, so both import, and an overlapping later file
  finds both again. A third one in a new file is new.
- **Transfers between own accounts:** every new row's picker has a *Transfer between my accounts* section, "To
  {account}" for money out and "From {account}" for money in (search "μεταφορά" or the bank's name); the import
  writes the other account's side too, and neither counts as spending or income. Money never leaves a meal-voucher
  account this way. **ATM withdrawals** (ΑΝΑΛΗΨΗ, ATM) start as a transfer to Cash when a cash account exists. **Card payments** (ΠΛΗΡΩΜΗ ΚΑΡΤΑΣ…) wait for the card statement, which pairs them; the review and the
  landing banner do not count them as "to categorise".
- **Commit** runs in one database transaction and checks every row again, so a double click or two previews of one
  file never insert twice. **Undo** removes the rows the import created (and a cash side it wrote); linked
  hand-entered rows stay, and the other side of a paired transfer goes back to "to categorise".
- **Reading:** UTF-8 (with or without BOM), UTF-16 with BOM, else Windows-1253; `;`, `,` or tab; header row found in
  the first 30 lines by Greek or English column names; amounts in cents with the bank's decimal separator;
  Excel-style text cells (`="…"`, Eurobank) unwrapped.
- **Bank formats:** the bank presets know where the columns sit; an account gets one through its bank's
  `statementPreset` ([banks.md](banks.md)). These positions are taken from the household's earlier converter script:
  - **Eurobank** (account and card): header in row 0; date, description and amount in columns 1, 3 and 4.
  - **Alpha card:** the header row says `Ημ/νία συναλλαγής`; date, description and amount in columns 1, 2 and 5.
  - **Alpha account:** the header row says `Ημερομηνία` and `Ποσό`; date, description and an unsigned amount in
    columns 2, 3 and 7. Column 8 is the flag: `Π` means money in, `Χ` means money out.

  Card exports print a purchase as a positive amount, so the app flips it. Order tried: the mapping saved on the
  account → the bank's layout, used only when its dated rows all have an amount and no header names those columns
  as something else → the header names → the column mapping step. An Alpha account file without a flag column is
  never read as signed (every debit would turn into income).
- **Balance check:** the balance after the statement's last movement (newest first or oldest first is detected;
  a card's debt is flipped to negative) is stored on the import and compared with the app's balance on that day,
  after the commit and again whenever past imports are listed.
- **Privacy:** the renderer never sees the file path or bytes: main keeps the chosen path behind an id, reads at
  most 10 MB, and keeps a parsed preview in memory for 30 minutes. Nothing leaves the machine.

## Code

| Path | Role |
| --- | --- |
| `src/main/services/import/` | `decode`, `csv`, `profiles`, `parse-rows`, `fingerprint`, `dedupe`, `transfer-match`, `apply-rules`, `read-statement`, `build-preview`, `reconcile` (pure), `picked-files`, `import-service` (preview, commit, undo, history) |
| `src/main/ipc/import.ts` | Thin handlers |
| `src/renderer/src/components/import/` | `ImportWizard`, `ColumnMappingStep`, `ImportReview`, `RulePrompt`, `ImportHistory`, `ReconciliationNote` |
| `src/renderer/src/lib/import-review.ts` | Row defaults, decisions, counts, filters, same-merchant fill, mapping form |
| `src/renderer/src/store/import.ts` | Wizard and history open state; the last import for the banner |
| `src/shared/statement-import.ts` | Shared shapes |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `import:pickFile` | `({ title, filterName })` → `{ fileId, fileName }` or `null` | — |
| `import:preview` | `(accountId, fileId, mapping?)` → `PreviewResult` (`ok: false` with `NO_ROWS`/`UNKNOWN_FORMAT` and a sample) | `INVALID_INPUT`, `ACCOUNT_NOT_FOUND`, `IMPORT_FILE_UNREADABLE`, `IMPORT_FILE_TOO_LARGE` |
| `import:commit` | `({ previewId, decisions })` → `CommitResult` (counts, batch id, reconciliation) | `INVALID_INPUT`, `IMPORT_PREVIEW_EXPIRED`, `IMPORT_NOTHING_TO_IMPORT`, `SAME_ACCOUNT`, `ACCOUNT_NOT_FOUND` |
| `import:history` | `(accountId?)` → `ImportHistoryItem[]` | — |
| `import:undo` | `(batchId)` → `{ removedCount }` | `INVALID_INPUT`, `IMPORT_NOT_FOUND`, `IMPORT_ALREADY_UNDONE` |

Rules (`rule:*`) are listed in [transactions.md](transactions.md#ipc).

## Tests

`services/import/import-engine.test.ts` (decode, CSV, presets and header search, amounts, dates, fingerprints,
dedupe, transfers, rules), `reconcile.test.ts`, `src/main/__tests__/statement-import.test.ts` (overlapping files,
same file, double click, twin link, card payment pairing, ATM → Cash, column mapping saved, balance check, undo)
and `lib/import-review.test.ts` (row defaults, decisions, filters, same-merchant fill, mapping form).
