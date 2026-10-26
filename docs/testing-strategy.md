# Testing Strategy

## Principle

**All main-process and shared logic requires tests**: services, IPC validation, pure calculations and database
queries. Renderer code needs tests for shared UI primitives and critical flows.

## Test Scope by Layer

### 1. Shared pure logic (`src/shared/*.ts`)
- **What**: money parsing/formatting, balance and budget maths, recurrence dates, projections
- **How**: plain unit tests, no mocks. This is where most money correctness lives, so it gets the most cases
- **Example**: `src/shared/money.test.ts`

### 2. Services (`src/main/services/*.ts`)
- **What**: validation, error codes, transfers staying balanced, archive rules
- **How**: integration tests against a real throw-away SQLite file (migrations applied), not a mocked Prisma
  ```ts
  describe('transactions', () => {
    it('should create two linked rows when the transaction is a transfer', async () => { })
    it('should throw INVALID_AMOUNT when the amount is zero', async () => {
      await expect(createTransaction({ ...base, amountCents: 0 })).rejects.toThrow('INVALID_AMOUNT')
    })
  })
  ```

### 3. IPC handlers (`src/main/ipc/*.ts`)
- **What**: the handler calls the right service with the right arguments
- **How**: mock the service module; handlers have no logic of their own

### 4. Renderer
- **UI kit**: `renderToStaticMarkup` snapshots of classes, aria attributes and labels (`components/ui/ui.test.tsx`)
- **Stores and `lib/`**: unit tests for state transitions and helpers

## Coverage Requirements

| Tier | Scope | Target |
|------|-------|--------|
| **Tier 1** (Critical) | Money maths, balances, transfers, budget vs actual, recurring due dates | >90% |
| **Tier 2** (Important) | Projections, debt schedules, imports, notifications | >80% |
| **Tier 3** (Nice-to-have) | Settings, UI helpers | >60% |

Tier 1 must include happy path, error cases and edge cases (zero, negative, rounding, month ends, leap years).

## Best Practices

1. **Naming**: `should <expected behavior> when <condition>`
2. **Error testing**: assert the code — `rejects.toThrow('ERROR_CODE')`
3. **Dates**: pass "today" in as an argument; never depend on the real clock
4. **Isolation**: each service test gets a fresh database

## Commands

```bash
npm test                      # Run all tests
npm run test:coverage         # Coverage report
npm test -- money             # Single file
npx vitest                    # Watch mode
```
