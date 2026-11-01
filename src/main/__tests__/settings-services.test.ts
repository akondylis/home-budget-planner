import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { resetTestDb } from './test-db'
import { ensureSettings, getSettings, setWeekStart } from '../services/settings'

describe('week start setting', () => {
  beforeEach(async () => {
    resetTestDb()
    await ensureSettings()
  })

  it('starts on Monday by default', async () => {
    expect((await getSettings())?.weekStartsOn).toBe(1)
  })

  it('saves Sunday and back', async () => {
    await setWeekStart(0)
    expect((await getSettings())?.weekStartsOn).toBe(0)
    await setWeekStart(1)
    expect((await getSettings())?.weekStartsOn).toBe(1)
  })

  it('refuses any other day', async () => {
    await expect(setWeekStart(3)).rejects.toThrow('INVALID_INPUT')
    await expect(setWeekStart('0')).rejects.toThrow('INVALID_INPUT')
  })
})
