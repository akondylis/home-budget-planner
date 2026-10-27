import { describe, expect, it } from 'vitest'
import { closingBalance } from './reconcile'

const row = (bookedAt: string | null, balanceAfterCents: number | null) => ({ bookedAt, balanceAfterCents })

describe('closingBalance', () => {
  it('should take the last movement of the latest day in a file that runs forward', () => {
    expect(closingBalance([row('2026-10-01', 1000), row('2026-10-03', 900), row('2026-10-03', 850)], false))
      .toEqual({ date: '2026-10-03', cents: 850 })
  })

  it('should take the first row of a file listed newest first', () => {
    expect(closingBalance([row('2026-10-03', 850), row('2026-10-03', 900), row('2026-10-01', 1000)], false))
      .toEqual({ date: '2026-10-03', cents: 850 })
  })

  it('should flip a card balance to debt and ignore rows without a date', () => {
    expect(closingBalance([row('2026-10-01', 30000), row(null, 99)], true)).toEqual({ date: '2026-10-01', cents: -30000 })
  })

  it('should say nothing without a balance column', () => {
    expect(closingBalance([row('2026-10-01', null)], false)).toBeNull()
  })
})
