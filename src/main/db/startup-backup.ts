import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'

/** Startup copies kept in HomeBudget-data/backups on the portable edition */
export const KEEP_STARTUP_COPIES = 5

/**
 * Keeps the newest `keep` startup copies. Sorted by name (the timestamp), not mtime:
 * copyFileSync keeps the source's modified time on Windows.
 */
export function pruneStartupCopies(dir: string, keep = KEEP_STARTUP_COPIES): void {
  const copies = readdirSync(dir)
    .filter(f => f.startsWith('startup-') && f.endsWith('.db'))
    .sort()
    .reverse()
  for (const f of copies.slice(keep)) rmSync(join(dir, f), { force: true })
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/**
 * Portable edition: copies the database before any connection opens, so a stick
 * pulled out mid-write still leaves a recent good copy. With DELETE journaling and
 * no open connection a plain file copy is consistent. Failures never block startup.
 */
export function writeStartupCopy(dbFile: string, now = new Date()): void {
  if (!existsSync(dbFile)) return
  try {
    const dir = join(dirname(dbFile), 'backups')
    mkdirSync(dir, { recursive: true })
    copyFileSync(dbFile, join(dir, `startup-${stamp(now)}.db`))
    pruneStartupCopies(dir)
  } catch (err) {
    console.error('[PORTABLE] Startup copy failed:', err)
  }
}
