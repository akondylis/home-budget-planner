# Home Budget

**A family budget planner for the parents of one household.**
Monthly/yearly budget, accounts and cards, transactions with categories, subscriptions and bills (including non-monthly ones), debts and loans, projections, stats and reminders.

**Tech stack**: Electron 41 (Node.js + React 19), Prisma/SQLite, Tailwind 3, Zustand, i18next (ΕΛ/EN).
Theme, UI kit and UX rules are inherited from the Matchday project (`../chess-board`); keep them in sync by hand when either side improves.

---

## Always Follow

**Core Constraints**
- Offline-first desktop app; one household per database. Multi-PC / multi-user access is **undecided** → `docs/roadmap.md` (Needs a decision). Until then, keep main-process handlers transport-agnostic (plain `(args) => result` services) so an HTTP/sync layer can be added without rewriting them.
- No renderer DB access; IPC isolation enforced (renderer uses `window.api.*` only).

**Critical Implementation** *(one-line rule → canonical doc)*
- Money: amounts are `Int` minor units (cents), never `Float`; format with `formatMoney()` / `<Money>`, parse input with `parseMoney()` (`src/shared/money.ts`) → `docs/domain-model.md`
- Signs: an expense is negative, income positive; transfers between own accounts are two linked rows and never count as income/expense → `docs/domain-model.md`
- Dates: display with `formatDate()` / `formatDateTime()` (`src/shared/date-format.ts`); never `toLocaleDateString()`
- Design & usability: every UI/UX decision and every visual (screens, PDFs, charts, diagrams) follows UI/UX best practice, starts from the user's job and makes it clearer and easier; every change must improve clarity, visual hierarchy and UX; every feature plan includes a **UX** section and a UX walkthrough in its verification → `docs/design-principles.md`
- Charts: follow the `dataviz` skill; income/expense series use `chart-income` / `chart-expense` tokens (validated for colour-blind readers, light + dark)

**Working Style**
- Tool output efficiency: prefer grep `files_with_matches` over `content`; cap with `head_limit`; use `offset`+`limit` for file sections.
- No re-reads: if a file was already read or edited this session, use the known content from context.

**Quick Reference** *(answers common questions without reading docs)*
- IPC naming: `'domain:action'` (e.g. `'transaction:create'`, `'account:list'`); handler files in `src/main/ipc/` — one per domain: `settings`, `pdf`, `window` (more added per feature); after changing channels run `/redraw-diagram`
- Business logic in `src/main/services/`; IPC handlers stay thin
- Error codes: thrown as strings in main process, mapped to `error.*` i18n keys in the renderer (`src/renderer/src/lib/ipc-errors.ts`)
- Component split threshold: 800 lines

---

## Documentation Map

### Product
- **[docs/roadmap.md](docs/roadmap.md)** — Feature roadmap: Done, Future (queued), Needs a decision
- **[docs/features/](docs/features/README.md)** — One doc per shipped feature; template, 150-line rule, where docs go
- **[docs/domain-model.md](docs/domain-model.md)** — Draft entities (members, accounts, cards, transactions, budgets, recurring, debts) and money rules

### System Architecture
- **[docs/architecture.md](docs/architecture.md)** — Process design, IPC pattern, project structure, theme, i18n, build & dev
- **[docs/diagrams/](docs/diagrams/README.md)** — Architecture + IPC diagram (JSON source → SVG/PNG)
- **docs/archived/** — Overflow detail moved out of feature docs, each linking back to its summary
- **[docs/testing-strategy.md](docs/testing-strategy.md)** — Coverage tiers, test conventions, commands

### Code Quality & Standards
- **[docs/design-principles.md](docs/design-principles.md)** — Design & usability principles, UX plan template, review checklist
- **[docs/code-quality-solid.md](docs/code-quality-solid.md)** — SOLID principles (S, D, I) with code examples
- **[docs/code-quality-conventions.md](docs/code-quality-conventions.md)** — Naming, error handling, query optimization, modularity

### Coding Rules (`.claude/rules/`, auto-loaded)
- **database.md** — Prisma/SQLite conventions, migrations, money columns, query patterns
- **frontend.md** — React, Zustand, Tailwind tokens, i18n, IPC, component patterns
- **maintenance.md** — Docs upkeep, release triggers, file management

### Skills (`.claude/skills/`)
- **/git-commit** — Grouped Conventional Commit + push with confirmation
- **/release** — CHANGELOG notes, version bump, tag & push
- **/redraw-diagram** — Validate `docs/diagrams/architecture.json` against IPC/preload code and redraw the SVG/PNG

---

## Core Commands
- **Dev**: `npm run dev`
- **Test**: `npm test` (Vitest) · **Types**: `npm run typecheck`
- **New migration**: `npm run db:migrate -- --name <description>` · **Reset dev DB**: `npm run db:reset`
- **Build installer**: `npm run build`

## Project Standards
- **Verbosity Control:** Do NOT summarize code changes or diffs in the chat window. Provide only the proposed commit message and the confirmation prompt.

## Simplify Rules
- Do NOT run `/simplify` automatically after responses
- Only use `/simplify` when explicitly requested by the user
- Only apply `/simplify` after real code changes (not plan files or documentation)
