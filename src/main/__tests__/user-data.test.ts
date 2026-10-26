import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const { app, existsSync } = vi.hoisted(() => ({
  app: {
    isPackaged: true,
    commandLine: { hasSwitch: vi.fn(), appendSwitch: vi.fn() },
    getPath: vi.fn(),
    setPath: vi.fn(),
  },
  existsSync: vi.fn(),
}))

vi.mock('electron', () => ({ app }))
vi.mock('fs', async importOriginal => ({ ...(await importOriginal<typeof import('fs')>()), existsSync }))

import {
  isDataDirWritable, isPortable, pinUserDataPath, resetPortableCache,
  PORTABLE_DATA_DIR, PORTABLE_MARKER,
} from '../user-data'

describe('pinUserDataPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPortableCache()
    app.isPackaged = true
    app.commandLine.hasSwitch.mockReturnValue(false)
    app.getPath.mockImplementation((name: string) => (name === 'temp' ? '/Temp' : '/AppData/Roaming'))
    existsSync.mockReturnValue(false)
  })

  it('leaves installed builds on the default data folder', () => {
    pinUserDataPath()
    expect(app.setPath).not.toHaveBeenCalled()
    expect(isPortable()).toBe(false)
  })

  it('leaves dev runs on their own folder', () => {
    app.isPackaged = false
    pinUserDataPath()
    expect(app.setPath).not.toHaveBeenCalled()
  })

  it('respects an explicit --user-data-dir', () => {
    app.commandLine.hasSwitch.mockReturnValue(true)
    pinUserDataPath()
    expect(app.commandLine.hasSwitch).toHaveBeenCalledWith('user-data-dir')
    expect(app.setPath).not.toHaveBeenCalled()
  })

  it('keeps portable data next to the exe', () => {
    const root = dirname(process.execPath)
    existsSync.mockImplementation((p: string) => p === join(root, PORTABLE_MARKER))
    pinUserDataPath()
    expect(app.setPath).toHaveBeenCalledWith('userData', join(root, PORTABLE_DATA_DIR))
    expect(app.setPath).toHaveBeenCalledTimes(1)
    expect(app.commandLine.appendSwitch).not.toHaveBeenCalled()
    expect(isPortable()).toBe(true)
  })

  it('ignores the marker in dev runs', () => {
    app.isPackaged = false
    existsSync.mockReturnValue(true)
    expect(isPortable()).toBe(false)
  })
})

describe('isDataDirWritable', () => {
  it('creates the folder and leaves no probe file behind', async () => {
    const { readdirSync } = await vi.importActual<typeof import('fs')>('fs')
    const dir = join(mkdtempSync(join(tmpdir(), 'hb-portable-')), PORTABLE_DATA_DIR)
    expect(isDataDirWritable(dir)).toBe(true)
    expect(readdirSync(dir)).toEqual([])
  })

  it('reports a folder that cannot be created', () => {
    expect(isDataDirWritable(join(process.execPath, 'not-a-dir'))).toBe(false)
  })
})
