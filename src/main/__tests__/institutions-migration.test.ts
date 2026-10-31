// The migration that turned the Institution enum into a table must carry every
// existing account's bank over, not just create the new column.
import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const MIGRATIONS = join(__dirname, '../../../prisma/migrations')
// Each test replays every migration on a fresh file: slow when the whole suite runs in parallel
vi.setConfig({ testTimeout: 30_000 })
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

describe('bank_statement_presets migration', () => {
  it('should give Piraeus and Revolut their presets by id, keep a renamed bank\'s name and leave a preset set by hand', () => {
    const TARGET = '20261030140000_bank_statement_presets'
    const sqlite = new Database(join(mkdtempSync(join(tmpdir(), 'home-budget-migration-')), 'test.db'))
    const dirs = readdirSync(MIGRATIONS).filter(d => existsSync(join(MIGRATIONS, d, 'migration.sql'))).sort()
    const run = (dir: string) => sqlite.exec(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf-8'))
    dirs.filter(d => d < TARGET).forEach(run)
    sqlite.exec(`UPDATE "Institution" SET "name" = 'Πειραιώς' WHERE "id" = 'inst_piraeus'; UPDATE "Institution" SET "statementPreset" = 'eurobank' WHERE "id" = 'inst_revolut'`)

    dirs.filter(d => d >= TARGET).forEach(run)

    const rows = sqlite.prepare(`SELECT "id", "name", "statementPreset" FROM "Institution" WHERE "statementPreset" IS NOT NULL ORDER BY "sortOrder"`).all()
    expect(rows).toEqual([
      { id: 'inst_alpha', name: 'Alpha Bank', statementPreset: 'alpha' },
      { id: 'inst_eurobank', name: 'Eurobank', statementPreset: 'eurobank' },
      { id: 'inst_piraeus', name: 'Πειραιώς', statementPreset: 'piraeus' },
      { id: 'inst_revolut', name: 'Revolut', statementPreset: 'eurobank' },
      { id: 'inst_viva', name: 'Viva Wallet', statementPreset: 'viva' },
    ])
    sqlite.close()
  })
})

describe('account_iban_pending migration', () => {
  it('should add a unique IBAN per account and a pending flag, and give Viva its preset', () => {
    const TARGET = '20261101120000_account_iban_pending'
    const sqlite = new Database(join(mkdtempSync(join(tmpdir(), 'home-budget-migration-')), 'test.db'))
    const dirs = readdirSync(MIGRATIONS).filter(d => existsSync(join(MIGRATIONS, d, 'migration.sql'))).sort()
    const run = (dir: string) => sqlite.exec(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf-8'))
    dirs.filter(d => d < TARGET).forEach(run)
    sqlite.exec(`INSERT INTO "Account" ("id", "name", "kind", "openingDate", "updatedAt") VALUES ('a', 'A', 'CURRENT', 0, 0), ('b', 'B', 'SAVINGS', 0, 0)`)
    sqlite.exec(`INSERT INTO "Transaction" ("id", "accountId", "bookedAt", "amountCents", "updatedAt") VALUES ('t', 'a', 0, -100, 0)`)

    dirs.filter(d => d >= TARGET).forEach(run)

    expect(sqlite.prepare(`SELECT "pending" FROM "Transaction" WHERE "id" = 't'`).get()).toEqual({ pending: 0 })
    sqlite.exec(`UPDATE "Account" SET "iban" = 'GR1601101250000000012300695' WHERE "id" = 'a'`)
    expect(() => sqlite.exec(`UPDATE "Account" SET "iban" = 'GR1601101250000000012300695' WHERE "id" = 'b'`)).toThrow(/UNIQUE/)
    expect(sqlite.prepare(`SELECT "statementPreset" FROM "Institution" WHERE "id" = 'inst_viva'`).get()).toEqual({ statementPreset: 'viva' })
    sqlite.close()
  })
})
