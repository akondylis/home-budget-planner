// A throw-away SQLite database with every migration applied, for service tests.
// Usage in a test file:
//   vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())
//   beforeEach(() => resetTestDb())
import Database from 'better-sqlite3'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PrismaClient } from '../../../prisma/generated/client/client'

const MIGRATIONS = join(__dirname, '../../../prisma/migrations')

let current: { prisma: PrismaClient; sqlite: Database.Database } | null = null
/** The starter banks as the migrations left them, put back by every reset */
let starterBanks: Record<string, unknown>[] = []

export function createTestDb(): { prisma: PrismaClient; sqlite: Database.Database } {
  const file = join(mkdtempSync(join(tmpdir(), 'home-budget-test-')), 'test.db')
  const sqlite = new Database(file)
  sqlite.pragma('foreign_keys = ON')
  for (const dir of readdirSync(MIGRATIONS).sort()) {
    const sql = join(MIGRATIONS, dir, 'migration.sql')
    if (existsSync(sql)) sqlite.exec(readFileSync(sql, 'utf-8'))
  }
  starterBanks = sqlite.prepare('SELECT * FROM "Institution"').all() as Record<string, unknown>[]
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) })
  current = { prisma, sqlite }
  return { prisma, sqlite }
}

/** Empties every domain table (children first) and puts the starter banks back, so each test starts clean */
export function resetTestDb(): void {
  if (!current) throw new Error('createTestDb() first')
  for (const table of ['RecurringOccurrence', 'RecurringRule', 'Transaction', 'ImportBatch', 'CategoryRule', 'BudgetLine', 'Budget', 'Category', 'Card', 'Account', 'Member']) {
    if (table === 'Category') current.sqlite.exec('UPDATE "Category" SET "parentId" = NULL')
    current.sqlite.exec(`DELETE FROM "${table}"`)
  }
  current.sqlite.exec('DELETE FROM "Institution"')
  for (const row of starterBanks) {
    const cols = Object.keys(row)
    current.sqlite.prepare(`INSERT INTO "Institution" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(c => `@${c}`).join(', ')})`).run(row)
  }
}
