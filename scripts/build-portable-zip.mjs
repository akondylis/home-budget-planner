// Packs the portable (USB) edition: dist/win-unpacked + a `portable` marker and an
// empty HomeBudget-data/ folder → dist/HomeBudget-Portable-{version}.zip, with everything
// under a top-level HomeBudget/ folder. Run after `electron-builder` (which builds
// win-unpacked for the installer). The marker never reaches the installer.
// Uses the bsdtar that ships with Windows 10+ (tar -a picks zip from the extension).
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const dist = join(root, 'dist')
const unpacked = join(dist, 'win-unpacked')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

if (!existsSync(join(unpacked, 'Home Budget.exe'))) {
  console.error('dist/win-unpacked/Home Budget.exe not found: run electron-builder first')
  process.exit(1)
}

const staging = join(dist, 'portable-staging')
const app = join(staging, 'HomeBudget')
rmSync(staging, { recursive: true, force: true })
cpSync(unpacked, app, { recursive: true })
writeFileSync(join(app, 'portable'), '')
mkdirSync(join(app, 'HomeBudget-data'))

const zip = join(dist, `HomeBudget-Portable-${version}.zip`)
rmSync(zip, { force: true })
// Git Bash puts GNU tar (no zip support) first on PATH, so call the Windows one explicitly
const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
execFileSync(tar, ['-a', '-c', '-f', zip, '-C', staging, 'HomeBudget'], { stdio: 'inherit' })
rmSync(staging, { recursive: true, force: true })
console.log(`✓ ${zip}`)
