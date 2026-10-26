# Home Budget

Family budget planner: monthly and yearly budget, accounts and cards, transactions with categories, subscriptions and bills (including yearly ones), debts and loans, projections, stats and reminders.

Desktop app (Electron + React + SQLite), Greek and English.

## Setup

Requires Node.js 22.14+.

```bash
npm install        # also generates the Prisma client and rebuilds native modules for Electron
npm run dev        # start the app with hot reload
npm test           # unit tests
npm run typecheck  # TypeScript, main + renderer
npm run build      # Windows installer + portable zip (HomeBudget-Portable-<version>.zip) in dist/
```

## Docs

Start with [CLAUDE.md](CLAUDE.md) — it maps the docs: roadmap, domain model, architecture, design principles and coding rules.
