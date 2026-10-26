import Database from 'better-sqlite3'
import { dbPath } from './db-path'
import { applyJournalPragmas } from './pragmas'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'

function getMigrationsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'prisma/migrations')
    : join(__dirname, '../../prisma/migrations')
}

/**
 * Applies pending Prisma migrations before the window opens.
 * Uses better-sqlite3 directly to eliminate dependency on npx and schema path lookup.
 * Backward-compatible with existing _prisma_migrations table from dev machines.
 */
export function runMigrations(): void {
  const dbDir = dirname(dbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
    console.log(`✓ Created database directory: ${dbDir}`)
  }

  const db = new Database(dbPath)
  try {
    applyJournalPragmas(db)

    db.exec(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                    TEXT PRIMARY KEY NOT NULL,
        "checksum"              TEXT NOT NULL,
        "finished_at"           DATETIME,
        "migration_name"        TEXT NOT NULL,
        "logs"                  TEXT,
        "rolled_back_at"        DATETIME,
        "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
        "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
      )
    `)

    const migrationsDir = getMigrationsDir()
    const entries = readdirSync(migrationsDir)
      .filter(d => d !== 'migration_lock.toml')
      .sort()

    const isApplied = db.prepare('SELECT id FROM "_prisma_migrations" WHERE migration_name = ?')
    const recordMigration = db.prepare(`
      INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
      VALUES (?, '', ?, datetime('now'), 1)
    `)

    for (const dir of entries) {
      if (isApplied.get(dir)) continue
      const sqlPath = join(migrationsDir, dir, 'migration.sql')
      if (!existsSync(sqlPath)) continue

      const sql = readFileSync(sqlPath, 'utf-8')
      console.log(`[Migration] Applying: ${dir}`)
      db.exec(sql)
      recordMigration.run(randomUUID(), dir)
      console.log(`[Migration] ✓ Applied: ${dir}`)
    }

    console.log('✓ Migrations completed successfully')
  } finally {
    db.close()
  }
}
