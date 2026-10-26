---
name: Database Rules
description: Prisma, SQLite, schema, money and migration patterns for Home Budget
type: feedback
paths:
  - prisma/schema.prisma
  - prisma/migrations/**/*.sql
  - src/main/db/**/*
  - src/main/ipc/**/*
  - src/main/services/**/*
---

## ORM & Database

- **Prisma** (ORM) + **SQLite** via `@prisma/adapter-better-sqlite3`; client generated to `prisma/generated/client/`. DB location and process layout → `docs/architecture.md`
- **No hardcoded user-facing strings in main process**; error codes passed to renderer for i18n translation

## Money (binding)

- Every amount column is `Int` in **minor units** (cents) and its name ends in `Cents` (`amountCents`, `openingBalanceCents`, `limitCents`). Never `Float`, never `Decimal` stored as text.
- Sign convention on `Transaction.amountCents`: income `> 0`, expense `< 0`. Planned/budget amounts are stored positive and the kind says which way they go.
- Currency is a 3-letter ISO code (`currency String @default("EUR")`) on accounts; conversions are out of scope until decided.
- Sums happen in SQL (`SUM(amountCents)`) or with `sumMoney()`; never sum formatted strings or floats.

## Schema Conventions

### Naming
- **Fields**: `camelCase` (e.g. `amountCents`, `bookedAt`, `memberId`)
- **Models**: PascalCase (e.g. `AppSettings`, `Account`, `RecurringRule`)
- **Enums**: PascalCase type, UPPER_SNAKE values (e.g. `AccountKind.CREDIT_CARD`)
- **Primary keys**: String `@id @default(cuid())` for domain rows; `AppSettings` is the single row `id = 1`
- **Unique constraints**: `@unique` on single fields; `@@unique([field1, field2])` for composites (e.g. one budget line per category per month)

### Relationships
- Foreign keys use `@relation(fields: [...], references: [...])`
- Cascade deletes only for truly dependent data (e.g. budget lines of a budget); transactions are never cascade-deleted with an account — archive the account instead (`archivedAt`)

### Audit & Timestamps
- `createdAt DateTime @default(now())` on all top-level models
- `updatedAt DateTime @updatedAt` on models that change
- Financial rows record who entered them (`createdByMemberId`) once members exist

### JSON Fields
- Use `Json?` only for semi-structured data (e.g. a recurrence rule); document its shape in a comment and validate it with zod in the service

## Migrations

### Execution
- **App startup** (`src/main/db/migrate.ts`): direct better-sqlite3 SQL runner, not `npx prisma migrate deploy`
  - Creates `_prisma_migrations` if missing, applies unapplied `migration.sql` files in order
  - Packaged builds read `process.resourcesPath/prisma/migrations`; dev reads `prisma/migrations`
- **Development workflow**: `npm run db:migrate -- --name <description>`

### Creating & Managing
- Migration folder naming: `YYYYMMDDHHMMSS_description`
- Do NOT edit existing migrations; create new ones for schema corrections
- Test migrations on a fresh database: `npm run db:reset && npm test`

## Query Patterns

```ts
prisma.account.findMany({
  where: { archivedAt: null },
  orderBy: { name: 'asc' },
  include: { owner: { select: { id: true, name: true } } },
})
```

- Filter and aggregate in the database (service layer), never in the renderer
- Avoid N+1: one query with `include`, or a grouped `SUM` for totals
- Multi-row writes (imports, transfers) go in one `prisma.$transaction`

### Error Handling
- Services throw string codes (`'ACCOUNT_NOT_FOUND'`, `'CATEGORY_IN_USE'`, `'INVALID_AMOUNT'`); the renderer maps them to `error.*` keys

## Development Commands

- `npm test`: Vitest
- `npx prisma studio`: inspect the dev database
