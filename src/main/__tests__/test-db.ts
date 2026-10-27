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

export function createTestDb(): { prisma: PrismaClient; sqlite: Database.Database } {
  const file = join(mkdtempSync(join(tmpdir(), 'home-budget-test-')), 'test.db')
  const sqlite = new Database(file)
  sqlite.pragma('foreign_keys = ON')
  for (const dir of readdirSync(MIGRATIONS).sort()) {
    const sql = join(MIGRATIONS, dir, 'migration.sql')
    if (existsSync(sql)) sqlite.exec(readFileSync(sql, 'utf-8'))
  }
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) })
  current = { prisma, sqlite }
  return { prisma, sqlite }
}

/** Empties every domain table (children first) so each test starts clean */
export function resetTestDb(): void {
  if (!current) throw new Error('createTestDb() first')
  for (const table of ['Transaction', 'ImportBatch', 'CategoryRule', 'Category', 'Card', 'Account', 'Member']) {
    if (table === 'Category') current.sqlite.exec('UPDATE "Category" SET "parentId" = NULL')
    current.sqlite.exec(`DELETE FROM "${table}"`)
  }
}
