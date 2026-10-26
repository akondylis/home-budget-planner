// Runs Vitest on Electron's own Node: better-sqlite3 is built for Electron's ABI
// (npm postinstall), so service tests can open a real database only there.
// Arguments pass through: `npm test -- money`, `npm run test:coverage`.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')
// vitest.mjs is not in the package exports; find it next to package.json
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')

const child = spawn(electron, [vitest, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
child.on('exit', code => process.exit(code ?? 1))
