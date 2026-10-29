// The migration that turned the Institution enum into a table must carry every
// existing account's bank over, not just create the new column.
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const MIGRATIONS = join(__dirname, '../../../prisma/migrations')
const TARGET = '20261029120000_institutions_table'

describe('institutions_table migration', () => {
  it('should map the old enum values to the starter banks, and Other to no bank', () => {
    const sqlite = new Database(join(mkdtempSync(join(tmpdir(), 'home-budget-migration-')), 'test.db'))
    const dirs = readdirSync(MIGRATIONS).filter(d => existsSync(join(MIGRATIONS, d, 'migration.sql'))).sort()
    const run = (dir: string) => sqlite.exec(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf-8'))
    dirs.filter(d => d < TARGET).forEach(run)

    const insert = sqlite.prepare(
      `INSERT INTO "Account" ("id", "name", "kind", "institution", "openingDate", "updatedAt") VALUES (?, ?, ?, ?, '2026-10-01', '2026-10-01')`,
    )
    for (const [id, kind, institution] of [
      ['a', 'CURRENT', 'ALPHA'], ['e', 'CREDIT_CARD', 'EUROBANK'], ['d', 'MEAL_VOUCHER', 'EDENRED'], ['u', 'MEAL_VOUCHER', 'UP_HELLAS'], ['c', 'CASH', 'OTHER'],
    ]) insert.run(id, id, kind, institution)

    dirs.filter(d => d >= TARGET).forEach(run)

    const rows = sqlite.prepare('SELECT "id", "institutionId" FROM "Account" ORDER BY "id"').all()
    expect(rows).toEqual([
      { id: 'a', institutionId: 'inst_alpha' },
      { id: 'c', institutionId: null },
      { id: 'd', institutionId: 'inst_edenred' },
      { id: 'e', institutionId: 'inst_eurobank' },
      { id: 'u', institutionId: 'inst_up_hellas' },
    ])
    sqlite.close()
  })
})
