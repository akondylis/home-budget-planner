import type Database from 'better-sqlite3'
import { isPortable } from '../user-data'

/**
 * Installed builds use WAL with NORMAL sync: fast and safe on a local disk. The portable
 * edition runs from a USB stick that may be pulled out: a single database file (no
 * -wal/-shm) with full fsync survives that far better, so it uses DELETE + FULL.
 */
export function applyJournalPragmas(db: Database.Database, portable: boolean = isPortable()): void {
  if (portable) {
    db.pragma('journal_mode = DELETE')
    db.pragma('synchronous = FULL')
  } else {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
  }
  db.pragma('foreign_keys = ON')
}
