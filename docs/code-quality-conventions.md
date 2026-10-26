# Coding Conventions & Patterns

Naming, error handling, code organization, query optimization, and modularity for the Home Budget codebase. For
SOLID principles, see [code-quality-solid.md](code-quality-solid.md).

---

## Error Handling

**Throw application error codes (strings). Let the IPC boundary carry them; the renderer translates them.**

```ts
// ✅ Service: throw a code
export async function archiveAccount(id: string) {
  const account = await prisma.account.findUnique({ where: { id } })
  if (!account) throw new Error('ACCOUNT_NOT_FOUND')
  if (account.archivedAt) throw new Error('ACCOUNT_ALREADY_ARCHIVED')
  return prisma.account.update({ where: { id }, data: { archivedAt: new Date() } })
}

// ✅ Handler: let it bubble
ipcMain.handle('account:archive', (_e, id: string) => archiveAccount(id))

// ✅ Renderer: map to i18n
catch (err) { setError(t(`error.${ipcErrorCode(err)}`)) }
```

Document the codes a handler can throw in a JSDoc line: `/** Throws: 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_ALREADY_ARCHIVED' */`.

Validate untrusted input at the service boundary with **zod**; a failed parse throws `'INVALID_INPUT'` (or a more
specific code).

---

## Code Organization

- **IPC**: one file per domain in `src/main/ipc/`, exporting `register<Domain>Handlers()`, called from `src/main/index.ts`.
- **Services**: one file per domain in `src/main/services/`.
- **Shared pure logic**: `src/shared/` (money, dates, projections, recurrence) — no Electron, no Prisma imports.

---

## Naming Conventions

- **Functions**: verb-first, active voice (`createTransaction`, `listAccounts`, `computeBudgetUsage`); avoid `handle`, `process`, `doStuff`.
- **Variables**: descriptive (`balanceCents`, `upcomingBills`); money variables end in `Cents`.
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_CURRENCY`, `REMIND_DAYS_DEFAULT`); enum values UPPER_SNAKE (`AccountKind.CREDIT_CARD`).

---

## Query Optimization

- **N+1 prevention**: one query with `include`, or a grouped aggregate, instead of per-row lookups.
- **Aggregate in SQL**: totals with `groupBy` / `_sum` / `SUM()`, not by loading every transaction.
- **Batch writes**: imports and generated rows in one `prisma.$transaction`.
- **Filter in the service**, never in the renderer.

---

## Modularity & Reuse

- Logic used in 2+ files → shared utility (`src/shared/` or a service helper).
- UI repeated in 3+ places → shared component (or a new `components/ui` primitive).

---

## Summary Checklist

- [ ] Each function has **one reason to change**
- [ ] IPC handlers are **thin**, delegating to services
- [ ] Errors are **thrown as code strings**, mapped to i18n in the renderer
- [ ] Money is **integer cents**, formatted only via `formatMoney` / `<Money>`
- [ ] Queries use `include` / aggregates; bulk writes are transactional
- [ ] Duplicated logic and repeated UI are **extracted**
- [ ] Names are **verb-first and descriptive**
- [ ] Tests **cover error cases**, not just happy paths
