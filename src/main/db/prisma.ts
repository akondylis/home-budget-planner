import Database from 'better-sqlite3'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../../../prisma/generated/client/client'
import { dbPath } from './db-path'
import { applyJournalPragmas } from './pragmas'

// Shared better-sqlite3 instance for raw SQL (bulk imports, reports).
// The journal mode is file-level: setting it here applies to all connections on this DB (see pragmas.ts).
export const sqlite: Database.Database = new Database(dbPath)
applyJournalPragmas(sqlite)
sqlite.pragma('busy_timeout = 5000')

// Prisma adapter uses its own internal connection to the same file.
// Journal mode and timeout are already active on the file from the sqlite instance above.
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })

export const prisma = new PrismaClient({ adapter })
