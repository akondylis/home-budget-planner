# Design & Usability Principles

Every feature has to make the app **clearer, better organised and easier to use**, not only more capable. The app is
used by the parents of one household, usually in short sessions: logging a few expenses in the evening, checking
what is left this month, or paying the bills that are due. Neither is an accountant. Design for the fastest correct
answer to *"how are we doing this month, and what is coming?"*

These principles are binding: every feature plan includes a **UX** section (see [Plan template](#plan-template)), and
every feature doc touched by a change describes its flow from the user's side. Styling mechanics (tokens, contrast,
icons, money display) live in `.claude/rules/frontend.md`; this doc covers *what* the user should experience.

## 0. Best practice first, the user's job always

This applies to **every** UI/UX decision and **every** visual: screens, dialogs, PDFs and printouts, charts, icons,
and the diagrams in `docs/diagrams/`.

- **Follow established UI/UX best practice.** That means platform conventions, Nielsen's heuristics, WCAG AA and
  the `dataviz` skill for charts. When a design breaks a well-known convention, the plan says why.
- **Start from the user's job, not from the data model.** Name the task the parent is doing ("pay this month's
  bills", "see if we can afford X"). Then design the shortest clear path to finish it. Fields, tables and options
  serve that task; they are never the starting point.
- **Clarity beats density.** Each screen or visual answers one question at a glance. Leave whitespace and keep
  a calm layout. Show less, and reveal detail on demand (hover card, expand, drill-down), rather than showing everything.
- **Reduce effort.** Ask on every change: does this save the user a click, a decision, some typing or a lookup? If
  it adds effort, it must add clear value.
- **Diagrams follow the same rules.** One idea per diagram, a clear reading direction, readable labels, no
  crossing lines where they can be avoided, and colours from theme tokens with sufficient contrast.

## 1. Clarity

- **One primary action** per screen or dialog. It is the only solid button (`Button variant="primary"`); everything
  else is secondary or ghost.
- **Labels say what happens**: "Add expense", "Mark as paid", "Pay off loan", not "OK", "Submit", "Go".
- **Say the consequence before an irreversible step** (`ConfirmDialog` with the item's name, the amount and what will
  be lost, e.g. "Delete account Eurobank Visa and its 214 transactions?").
- **Empty states explain the next step** ("No accounts yet — add your first bank account"), never a bare "No data".
- **Disabled controls explain why** (tooltip or hint: "Add an account first", "This month is closed").
- One term per concept across screens and both languages (e.g. Κίνηση / Transaction, Συνδρομή / Subscription,
  Δόση / Instalment).

## 2. Visual hierarchy

- Reading order on every page: **title → context line → primary content → secondary actions**.
  The context line (`MetaLine`: month · account · member) tells the user which slice of money they are looking at.
- Headline numbers first: a page with money answers its question in a `StatTile` row (income, expenses, left to
  spend, upcoming) before any list or chart.
- Lists: payee/name first and strongest; category, account and date muted on one line; amounts right-aligned with
  `tabular-nums`.
- Status (paid, due, overdue) uses `StatusBadge` — tone **plus** icon and text, **never colour alone**. Income and
  expense carry a sign or label, not only green/red.
- Anything planned but not yet booked uses the one draft look: `DraftBadge` / `DRAFT_TONE` or `<Money tone="planned">`.
- Secondary information (hints, source notes, IBANs) is visually quieter than the content it supports.

## 3. Flow & speed

- **Smart defaults from what the app already knows**: today's date, the last account used, the usual category for
  this payee, the member who is logged in. The user should confirm, not retype.
- **Fewest clicks on the everyday path** (add expense → see what is left). Every extra dialog on that path needs a
  reason.
- Amount fields accept both `12,50` and `12.50`; the currency symbol is never typed.
- Keyboard: Enter triggers the primary action, Esc closes, focus lands on the first field (the amount, when adding a
  transaction).
- After a create, **show the created item** in its list.

## 4. Feedback

- **Preview before import or bulk change** (bank statement import, recurring rule that will create 12 rows).
- **Inline validation next to the field**; the field hint turns into the error text in the same place. Toasts are for
  outcomes, not for field errors.
- `Banner` for things that need action (over budget in a category, a bill due tomorrow, an account not reconciled
  for 60 days); keep it above the content it refers to.
- Errors in plain language: main throws a code, the renderer maps it to `error.*` — never show a raw code or stack.

## 5. Consistency

- Build with the shared kit in `components/ui`: `Modal`, `Field`, `Input`, `Segmented`, `Banner`, `Button`,
  `IconButton`, `Badge`, `StatusBadge`, `Money`, `StatTile`, `List` (`ListCard`, `ListRow`, `RowTitle`, `MetaLine`),
  `PageHeader`, `FilterPopover`, `ConfirmDialog`, `CollapsibleCard`. Extend the kit instead of creating one-off variants.
- Same action, same place: row actions in a ⋮ menu, the primary row action as an icon.
- Charts follow the `dataviz` skill: one axis, legend for ≥ 2 series, a table view, colours from tokens.

## 6. Accessibility & languages

- WCAG AA contrast in **light and dark** themes.
- Icon-only controls carry a translated `title` and `aria-label`; inputs have a `<label>`; errors are linked with
  `aria-describedby` / `aria-invalid`.
- Greek text is usually longer than English: check both languages at the default window size; key information
  (names, amounts, status) must never be truncated — truncate metadata first and show the full text on hover.

## Plan template

Every feature plan includes, per feature:

**UX**
- **User's job**: the task the user is trying to get done, and how this design makes it faster or clearer.
- **Entry point** — where the user starts it, and what the control is called.
- **Primary action** — the one solid button and its label.
- **Defaults** — what is pre-filled and from where.
- **States** — empty, error, disabled (with reason) and success (where the user lands).
- **Hierarchy** — what is most prominent, what is secondary.

**Verification** adds a **UX walkthrough**: light + dark, ΕΛ + EN, keyboard Enter/Esc, tooltips on icon buttons,
no truncated key text, one primary button per dialog, amounts right-aligned and signed.

## Checklist for reviews

- [ ] Follows UI/UX best practice; any break with convention is justified
- [ ] Built around the user's job; the path to finish it is shorter or clearer than before
- [ ] Clear at a glance: one question per screen or visual, detail on demand
- [ ] One primary action; labels name the outcome
- [ ] Context line visible; identity before options
- [ ] Defaults filled from known data
- [ ] Inline validation; disabled controls explain why
- [ ] Empty / error / success states designed
- [ ] Shared `components/ui` used; no one-off styles
- [ ] Money via `Money` / `formatMoney`; never colour alone for income/expense
- [ ] Light/dark and ΕΛ/EN checked
