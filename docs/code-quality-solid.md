# SOLID Principles

Maintainable code practices using SOLID principles, applied to the Home Budget codebase.

## S — Single Responsibility Principle

**Each function, class, or module should have one reason to change.**

- **IPC Handlers** (`src/main/ipc/*.ts`): request routing and argument unpacking only. Business logic lives in services.
  ```ts
  // ❌ Bad: handler validates, queries, computes balances and writes
  ipcMain.handle('transaction:create', async (_e, data) => {
    const account = await prisma.account.findUnique({ where: { id: data.accountId } })
    // ... 50 lines of validation, category defaults, transfer pairing
  })

  // ✅ Good: handler delegates to a service
  ipcMain.handle('transaction:create', (_e, data: unknown) => createTransaction(data))
  ```

- **Services** (`src/main/services/*.ts`): one business domain each (transactions, budgets, recurring rules,
  projections). Pure calculations (balances, projections, provisions) live in `src/shared/` so both processes and
  tests use them without a database.
  ```ts
  // ✅ Pure: shared/projection.ts — no I/O, easy to test
  export function projectBalances(start: number, events: CashEvent[], months: number): MonthBalance[] { }

  // ✅ Service: services/projections.ts — loads data, calls the pure function
  export async function getProjection(months: number) {
    return projectBalances(await currentBalance(), await upcomingEvents(months), months)
  }
  ```

- **Component Decomposition** (React): components over 800 lines are split by concern
  (`TransactionsScreen` → `TransactionFilters`, `TransactionList`, `TransactionForm`).

## D — Dependency Inversion Principle

**Depend on abstractions (services, `window.api`), not concrete implementations.**

- Handlers depend on services, not on Prisma; the renderer depends on `window.api`, never on main-process code.
  ```ts
  // ❌ Bad: renderer imports the database
  import { prisma } from '../../main/db/prisma'

  // ✅ Good: renderer uses the bridge
  const accounts = await window.api.listAccounts()
  ```

- Services take and return plain data, so the same service can later sit behind HTTP or sync (see
  `docs/architecture.md`, transport-agnostic services).

- **Error Handling**: services throw application error codes; handlers let them propagate; the renderer maps them.
  ```ts
  // Service
  if (amountCents === 0) throw new Error('INVALID_AMOUNT')

  // Renderer
  try {
    await window.api.createTransaction(input)
  } catch (err) {
    setError(t(`error.${ipcErrorCode(err)}`))
  }
  ```

## I — Interface Segregation Principle

**Create focused, minimal interfaces. Clients should not depend on what they don't use.**

- **Component Props**: pass what the component renders, not whole records with callbacks for everything.
  ```ts
  // ❌ Bad
  interface AccountCardProps { account: Account; transactions: Transaction[]; onEdit; onDelete; onImport; onTransfer }

  // ✅ Good
  interface AccountBalanceProps { name: string; balanceCents: number; currency: string }
  ```

- **Service Interfaces**: export the functions callers need; keep helpers module-private.

**Benefits**: focused tests, reusable services, database changes that do not ripple into the UI.
