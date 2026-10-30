# Home Budget — Feature Roadmap

As of 2026-10-30 · Andrew Kondylis

## Overview

The project starts from the Matchday shell (theme, UI kit, UX rules). The Matchday conveniences (palette, hover cards, tour, portable edition, PDF preview) have been ported.
The first domain slice has shipped: accounts and cards, categories, transactions with quick cash entry, and Alpha
Bank / Eurobank statement import (plan `.claude/plans/in-the-app-i-quizzical-stroustrup.md`). **12 items** are queued
in Future, grouped by theme with one global priority (`#`); the order is a proposal to discuss. Three items wait on a
decision.

- **Users:** the parents of one household (Greek first, English available).
- **Rule:** every item gets its own plan with a UX section before work starts (see `docs/design-principles.md`).
- **Plans:** saved in `.claude/plans/`; a roadmap row names its plan file in *Depends on / plan*. Plans that touch
  this file include a `## Roadmap entry` section (see `docs/design-principles.md`).
- **Model:** draft entities and open questions → [domain-model.md](domain-model.md).

## Done

Details live in the linked feature doc (`docs/features/`). Newest first.

| Shipped | Feature | Notes |
| --- | --- | --- |
| 2026-10-30 | Subscriptions & bills | Weekly, monthly, yearly and every-N rules (quarterly, every 2 weeks) for bills, subscriptions and income; a typed or imported row that matches marks the date paid on its own, **Mark as paid** picks a row or adds a cash one, **Skip** for a missed one (no auto-created rows, decided 2026-10-30); fixed costs per month; yearly charges offered as a monthly plan line in the budget with Carry over (decided 2026-10-30); **Track it** turns a subscription hint into a rule; fills the Overview's **Upcoming bills** · [subscriptions & bills](features/subscriptions-bills.md) |
| 2026-10-30 | Overview (live) | The start page from real data: tiles for income and spending this month (transfers left out), **Left to spend** from the budget with its meter (or **No plan yet**), and money in accounts (meal vouchers apart). Each tile opens its detail. Banners name the categories over the plan and the rows to categorise; the setup checklist ticks itself and hides once done; **Upcoming bills** filled by #7 · [overview](features/overview.md) |
| 2026-10-29 | Banks as an editable list | Add a bank (Revolut, Piraeus, NBG…) from the account form's **+ New bank…** or Settings › **Banks** (rename, reorder, archive) with no code change; common Greek banks and the meal-card issuers listed from the start; grouping and filters on Accounts follow the list and its order, **No bank** last; existing accounts keep their bank (decided 2026-10-29) · [banks](features/banks.md) |
| 2026-10-28 | Meal-voucher cards | Edenred and Up Hellas cards as their own account kind: top-up = income in **Meal vouchers**, food = ordinary expense, so the budget shows what the family really eats; balance marked **Food only** and kept beside the accounts total; never a transfer source, never imported; overspending warns, never blocks (decided 2026-10-28) · [meal vouchers](features/meal-vouchers.md) |
| 2026-10-28 | Accounts: group by & filters | Group the account cards by bank, holder or type, each group with its subtotal; filter by type, bank and holder (a parent's card counts as theirs); grouping remembered per PC, filters per session · [accounts](features/accounts.md) |
| 2026-10-28 | Back/forward & shortcuts | Same as Matchday: mouse back/forward buttons, `Alt+←`/`Alt+→` and title-bar arrows through the pages visited; `?`/`F1` cheat-sheet; `Ctrl+P` prints the page on screen (or the monthly worksheet) · [command palette & shortcuts](features/command-palette.md) |
| 2026-10-28 | Monthly budget | Plan per category (groups sum), income planned per category; inline amounts that save on their own; copy last month's plan or last month's spending into empty lines; budget vs actual with meters; **Left to budget** (zero-based) and **Left to spend**; per-category **Carry over** of unspent money only (plan level, income, rollover and editing decided 2026-10-28); banners for rows to categorise and unplanned spending; printable sheet filled from the plan · [budget](features/budget.md) |
| 2026-10-28 | Category management | Categories page off Transactions (and Settings, `Ctrl+K`): rename, reorder, move between groups, merge (the merged one is archived, decided 2026-10-28), archive/restore, delete when unused, counts per category, **Show transactions**; **Merchant rules** tab to search, add, edit and delete rules · [categories](features/categories.md) |
| 2026-10-28 | Account holders & cards | Each account has a holder (a parent or Joint), shown on its card; cards per account (debit cards, main and supplementary credit cards) with last 4 digits and holder, edited in the account form and saved in one go. The holder is shown only, never a default "For" (decided 2026-10-27) · [accounts](features/accounts.md) |
| 2026-10-27 | Members | Parents only ("children included?" answered 2026-10-27), name and colour, in Settings → Household; "who is using the app" chip in the sidebar (per PC, `Ctrl+K`) stamps who entered each row and import; transactions carry **For** (a parent or Household) with a payee default, a log filter and bulk **Set "For"…** · [members](features/members.md) |
| 2026-10-27 | Statement import | Alpha Bank and Eurobank CSV (accounts and cards; "which banks first?" answered 2026-10-26). Wizard: account + file, column mapping once per account for unknown files, review with status chips. Never doubles a row (fingerprint with in-file occurrence, hand-entered twin → **Link**, transfer pairing, ATM → Cash); merchant rules learned with "Always put X in Y?"; undo; past imports; statement balance checked against the app. Bank presets read the column layouts of the household's earlier converter (2026-10-27); a real file of each type still to be tried · [statement import](features/statement-import.md) |
| 2026-10-26 | Transactions & categories | Log with month/account/type/category filters and a **To categorise** inbox; entry form (expense, income, transfer; amount first, smart defaults, **Add & new**, `Ctrl+N`); six category types (income, bills, subscriptions, spending, debt, savings) with a Greek starter set. Added 2026-10-27: dates typed in the Settings format, rule prompt in the log, "looks like a subscription" hints · [transactions](features/transactions.md) |
| 2026-10-26 | Accounts & cards | Quick setup of the usual five (Alpha and Eurobank account and card, Cash) with balances; balance per account (a card's debt is negative); cash as an account; archive instead of delete · [accounts](features/accounts.md) |
| 2026-10-26 | Docs, roadmap & diagram conventions | One doc per feature in `docs/features/` (template, 150-line rule, overflow to `docs/archived/`); roadmap rows name their plan; `/redraw-diagram` draws the architecture + IPC diagram, checked against the code · [features](features/README.md) |
| 2026-10-26 | PDF export with preview | Page-size preview of exactly what will print, sheet language ΕΛ/EN, **Export PDF** then **Open**; first report: a printable monthly budget worksheet (Overview, `Ctrl+K`); Greek fonts embedded · [pdf export](features/pdf-export.md) |
| 2026-10-26 | Portable USB edition | `HomeBudget-Portable-{version}.zip`: data in `HomeBudget-data/` next to the exe, USB-safe SQLite (`DELETE` + `FULL`), startup copy (newest 5), clear error on a read-only stick, **Portable** badge · [portable](features/portable.md) |
| 2026-10-26 | App tour | Spotlight walk through every sidebar area and `Ctrl+K`; runs once on first launch, replay from Settings or `Ctrl+K` · [app tour](features/app-tour.md) |
| 2026-10-26 | Hover cards | Generic `HoverCard` in the UI kit; collapsed sidebar shows each page and what is coming, the Portable badge shows the data folder · [hover cards](features/hover-cards.md) |
| 2026-10-26 | Command palette & shortcuts | `Ctrl+K` over pages and commands (worksheet, tour, theme, language, sidebar, zoom); ignores accents and script; one shortcut table · [command palette](features/command-palette.md) |
| 2026-10-26 | Project foundation | Electron + React + Prisma/SQLite skeleton; Matchday theme (light/dark/system), UI kit, sidebar shell; ΕΛ/EN; money helpers (`formatMoney`/`parseMoney`, integer cents); Overview with setup steps; Settings (theme, sidebar, language, date format, data folder) |

## Future

Sizes: S ≈ ½ day, M ≈ 1–2 days, L > 2 days. *New* marks items added after 2026-10-26.

### Planning & reminders

| # | Feature | Size | What it does | Depends on / plan | Open |
| --- | --- | --- | --- | --- | --- |
| 8 | Notifications | M | Sidebar bell (Matchday pattern): bill due, overdue, over budget, instalment due; Windows toast | #7, #9 | Remind N days before? |
| 17 | Payment calendar *(new)* | M | Amounts due by date with paid marks, pay days across the year; week starts Monday or Sunday | #7 | — |
| 9 | Debts & loans | M | Loans, interest-free instalments, money owed; remaining balance, payoff date, schedule; **snowball / avalanche** payoff with an extra monthly amount, interest before payment, manual balance override | Accounts | Interest calculation needed? |
| 10 | Yearly budget | S–M | 12-month plan view, year vs last year; budgeting per pay period as an option | Monthly budget | — |
| 11 | Projections | M | Balance forecast per month from rules, instalments and planned income | #7, #9 | Horizon (6/12/24 months) |

### Insight & data

| # | Feature | Size | What it does | Depends on / plan | Open |
| --- | --- | --- | --- | --- | --- |
| 12 | Reports & stats | M–L | Spending by category/member/month, trends, year-over-year, balances across accounts over time; charts per `dataviz` skill; Excel/PDF export | Transactions; PDF export with preview | — |
| 18 | Net worth *(new)* | S–M | Assets − debts, a monthly snapshot and its trend | Accounts, #9 | — |
| 19 | Card matching *(new)* | S | Read the last 4 digits in statement text and mark which card (and so which parent) paid | Account holders & cards; Statement import | Do Alpha/Eurobank files show the card number? |
| 13 | More statement formats | S–M | Try one real Alpha Bank and Eurobank export of each type (layouts taken from the old converter, 2026-10-27); Excel (`.xlsx`) exports; more Greek banks | Statement import | Which banks next? |
| 16 | Direct printing *(new)* | S | **Print** button in the PDF preview: silent print to the default printer (Matchday's `pdf-to-printer`) | PDF export with preview | Needed, or is Open → print enough? |
| 14 | Backups | M | Automatic backups (on quit/weekly, keep N), restore; encrypted option | Startup copy from the portable edition (`startup-backup.ts`) | Folder (cloud-synced folder?) |
| 15 | Saving goals | S–M | Targets with progress %, months left and a monthly amount to reach them; **sinking funds** tied to irregular bills; "ongoing" pots with no target; withdrawals | Accounts | — |

## Needs a decision

Not queued until the open questions are answered.

| Item | Question | Where |
| --- | --- | --- |
| Multi-PC / multi-user (L) | Do both parents use the same PC, or each their own (and phones)? Options: **(a)** one PC, desktop only; **(b)** database in a shared cloud folder (simple, but two people must never have it open at once); **(c)** small sync server or hosted web version with login (Matchday's "web version" discussion: `window.api` behind a transport adapter, same services). Services are kept transport-agnostic now so (c) stays possible | [domain-model.md](domain-model.md) (question 1) |
| Bank connectivity | Manual + statement import only, or open-banking (PSD2) sync later? Sync needs a provider, consent renewal every 90 days and a server | [domain-model.md](domain-model.md) (question 2) |
| Privacy between members | Can a parent keep accounts private? Needs members as users (PIN/password) | [domain-model.md](domain-model.md) (question 5) |

## Last

Nothing yet.

## Dropped

| Item | Why |
| --- | --- |
| Card limit, statement day, due day | Not needed for now (2026-10-27); can return with Notifications (#8) |
