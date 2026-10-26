# Home Budget — Feature Roadmap

As of 2026-10-26 · Andrew Kondylis

## Overview

The project starts from the Matchday shell (theme, UI kit, UX rules). The Matchday conveniences (palette, hover cards, tour, portable edition, PDF preview) have been ported; nothing
domain-specific has shipped yet. **16 items**
are queued in Future, grouped by theme with one global priority (`#`); the order is a proposal to discuss. Three items
wait on a decision.

- **Users:** the parents of one household (Greek first, English available).
- **Rule:** every item gets its own plan with a UX section before work starts (see `docs/design-principles.md`).
- **Plans:** saved in `.claude/plans/`; a roadmap row names its plan file in *Depends on / plan*. Plans that touch
  this file include a `## Roadmap entry` section (see `docs/design-principles.md`).
- **Model:** draft entities and open questions → [domain-model.md](domain-model.md).

## Done

Details live in the linked feature doc (`docs/features/`). Newest first.

| Shipped | Feature | Notes |
| --- | --- | --- |
| 2026-10-26 | Docs, roadmap & diagram conventions | One doc per feature in `docs/features/` (template, 150-line rule, overflow to `docs/archived/`); roadmap rows name their plan; `/redraw-diagram` draws the architecture + IPC diagram, checked against the code · [features](features/README.md) |
| 2026-10-26 | PDF export with preview | Page-size preview of exactly what will print, sheet language ΕΛ/EN, **Export PDF** then **Open**; first report: a printable monthly budget worksheet (Overview, `Ctrl+K`); Greek fonts embedded · [pdf export](features/pdf-export.md) |
| 2026-10-26 | Portable USB edition | `HomeBudget-Portable-{version}.zip`: data in `HomeBudget-data/` next to the exe, USB-safe SQLite (`DELETE` + `FULL`), startup copy (newest 5), clear error on a read-only stick, **Portable** badge · [portable](features/portable.md) |
| 2026-10-26 | App tour | Spotlight walk through every sidebar area and `Ctrl+K`; runs once on first launch, replay from Settings or `Ctrl+K` · [app tour](features/app-tour.md) |
| 2026-10-26 | Hover cards | Generic `HoverCard` in the UI kit; collapsed sidebar shows each page and what is coming, the Portable badge shows the data folder · [hover cards](features/hover-cards.md) |
| 2026-10-26 | Command palette & shortcuts | `Ctrl+K` over pages and commands (worksheet, tour, theme, language, sidebar, zoom); ignores accents and script; one shortcut table · [command palette](features/command-palette.md) |
| 2026-10-26 | Project foundation | Electron + React + Prisma/SQLite skeleton; Matchday theme (light/dark/system), UI kit, sidebar shell; ΕΛ/EN; money helpers (`formatMoney`/`parseMoney`, integer cents); Overview with setup steps; Settings (theme, sidebar, language, date format, data folder) |

## Future

Sizes: S ≈ ½ day, M ≈ 1–2 days, L > 2 days. *New* marks items added after 2026-10-26.

### Foundation

| # | Feature | Size | What it does | Depends on / plan | Open |
| --- | --- | --- | --- | --- | --- |
| 1 | Members | S | Family members with name and colour; "who is using the app" picker | — | Children included? |
| 2 | Accounts & cards | M | Bank accounts, cash, credit cards with opening balance, holder, statement/due day; archive instead of delete | #1 (holder) | Institutions list (Greek banks) seeded? |
| 3 | Categories | S–M | Two-level categories seeded with a Greek household set (Σπίτι, Σούπερ μάρκετ, Παιδιά, Αυτοκίνητο…); edit, merge, archive | — | — |

### Everyday money

| # | Feature | Size | What it does | Depends on / plan | Open |
| --- | --- | --- | --- | --- | --- |
| 4 | Transactions | L | Add/edit expense, income, transfer; fast entry (amount first, smart defaults); list with filters (month, account, member, category) | #2, #3 | — |
| 5 | Monthly budget | M | Plan per category, copy last month, budget vs actual with progress | #3, #4 | Rollover of unspent amounts? |
| 6 | Overview (live) | M | Stat tiles from real data, upcoming bills, over-budget banners | #4, #5 | — |

### Planning & reminders

| # | Feature | Size | What it does | Depends on / plan | Open |
| --- | --- | --- | --- | --- | --- |
| 7 | Subscriptions & bills | M | Recurring rules incl. yearly/quarterly charges with monthly provision; mark as paid | #2, #3 | Auto-create transactions or confirm each? |
| 8 | Notifications | M | Sidebar bell (Matchday pattern): bill due, overdue, over budget, instalment due; Windows toast | #7, #9 | Remind N days before? |
| 9 | Debts & loans | M | Loans, interest-free instalments, money owed; remaining balance, payoff date, schedule | #2 | Interest calculation needed? |
| 10 | Yearly budget | S–M | 12-month plan view, year vs last year | #5 | — |
| 11 | Projections | M | Balance forecast per month from rules, instalments and planned income | #7, #9 | Horizon (6/12/24 months) |

### Insight & data

| # | Feature | Size | What it does | Depends on / plan | Open |
| --- | --- | --- | --- | --- | --- |
| 12 | Reports & stats | M–L | Spending by category/member/month, trends, year-over-year; charts per `dataviz` skill; Excel/PDF export | #4; PDF export with preview | — |
| 13 | Statement import | L | CSV/Excel import per Greek bank with preview, duplicate detection and category rules | #4 | Which banks first? |
| 16 | Direct printing *(new)* | S | **Print** button in the PDF preview: silent print to the default printer (Matchday's `pdf-to-printer`) | PDF export with preview | Needed, or is Open → print enough? |
| 14 | Backups | M | Automatic backups (on quit/weekly, keep N), restore; encrypted option | Startup copy from the portable edition (`startup-backup.ts`) | Folder (cloud-synced folder?) |
| 15 | Saving goals | S–M | Targets with progress and a monthly amount to reach them | #2 | — |

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

Nothing yet.
