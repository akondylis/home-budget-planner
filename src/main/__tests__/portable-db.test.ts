import { describe, it, expect, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'

vi.mock('../user-data', () => ({ isPortable: () => false }))

import { applyJournalPragmas } from '../db/pragmas'
import { KEEP_STARTUP_COPIES, pruneStartupCopies, writeStartupCopy } from '../db/startup-backup'

const tempDir = (prefix: string) => mkdtempSync(join(tmpdir(), prefix))

// better-sqlite3 is built for Electron's Node, so the pragmas are checked on a recording fake
const fakeDb = () => {
  const pragmas: string[] = []
  return { pragmas, db: { pragma: (p: string) => { pragmas.push(p) } } as unknown as Database.Database }
}

describe('applyJournalPragmas', () => {
  it('uses a single file with full fsync on the portable edition', () => {
    const { db, pragmas } = fakeDb()
    applyJournalPragmas(db, true)
    expect(pragmas).toEqual(['journal_mode = DELETE', 'synchronous = FULL', 'foreign_keys = ON'])
  })

  it('keeps WAL + NORMAL on installed builds', () => {
    const { db, pragmas } = fakeDb()
    applyJournalPragmas(db, false)
    expect(pragmas).toEqual(['journal_mode = WAL', 'synchronous = NORMAL', 'foreign_keys = ON'])
  })

  it('follows isPortable() by default', () => {
    const { db, pragmas } = fakeDb()
    applyJournalPragmas(db)
    expect(pragmas[0]).toBe('journal_mode = WAL')
  })
})

describe('startup copies', () => {
  it('copies the database into backups/ with a timestamped name', () => {
    const dir = tempDir('hb-startup-')
    const db = join(dir, 'home-budget.db')
    writeFileSync(db, 'data')
    writeStartupCopy(db, new Date(2026, 9, 26, 9, 5, 7))
    expect(readdirSync(join(dir, 'backups'))).toEqual(['startup-20261026-090507.db'])
  })

  it('does nothing on a first run without a database', () => {
    const dir = tempDir('hb-startup-')
    writeStartupCopy(join(dir, 'home-budget.db'))
    expect(existsSync(join(dir, 'backups'))).toBe(false)
  })

  it('keeps the newest five by name, whatever their modified time', () => {
    const dir = tempDir('hb-startup-')
    for (let d = 1; d <= 7; d++) writeFileSync(join(dir, `startup-2026102${d}-120000.db`), '')
    writeFileSync(join(dir, 'home-budget.db'), '')
    pruneStartupCopies(dir)
    const left = readdirSync(dir).filter(f => f.startsWith('startup-')).sort()
    expect(left).toHaveLength(KEEP_STARTUP_COPIES)
    expect(left[0]).toBe('startup-20261023-120000.db')
    expect(readdirSync(dir)).toContain('home-budget.db')
  })
})
