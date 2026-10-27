import { describe, expect, it } from 'vitest'
import { detectSubscriptions, type ChargeRow } from './subscription-detect'

let id = 0
const charge = (bookedAt: string, amountCents: number, key = 'netflix', patch: Partial<ChargeRow> = {}): ChargeRow => ({
  id: `t${id++}`, bookedAt, amountCents, key, label: 'Netflix', categoryId: null, categoryType: null, ...patch,
})
const TODAY = '2026-10-27'

describe('detectSubscriptions', () => {
  it('should find a merchant charging about the same every month', () => {
    const rows = [charge('2026-07-10', -1299), charge('2026-08-10', -1299), charge('2026-09-10', -1399), charge('2026-10-10', -1399)]
    expect(detectSubscriptions(rows, TODAY)).toEqual([
      expect.objectContaining({ key: 'netflix', amountCents: 1399, interval: 'MONTHLY', count: 4, lastDate: '2026-10-10' }),
    ])
  })

  it('should find a yearly charge', () => {
    const rows = [charge('2023-11-01', -4999, 'domain'), charge('2024-11-01', -4999, 'domain'), charge('2025-11-01', -4999, 'domain')]
    expect(detectSubscriptions(rows, TODAY)[0]).toMatchObject({ key: 'domain', interval: 'YEARLY', count: 3 })
  })

  it('should leave out groceries, too few charges, stopped ones and merchants already sorted as bills', () => {
    const groceries = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-10-01'].map((d, i) => charge(d, -4000 - i * 900, 'lidl'))
    const twice = [charge('2026-09-10', -999, 'spotify'), charge('2026-10-10', -999, 'spotify')]
    const stopped = [charge('2026-01-05', -500, 'gym'), charge('2026-02-05', -500, 'gym'), charge('2026-03-05', -500, 'gym')]
    const bill = ['2026-08-03', '2026-09-03', '2026-10-03'].map(d => charge(d, -3000, 'cosmote', { categoryType: 'BILL' }))
    expect(detectSubscriptions([...groceries, ...twice, ...stopped, ...bill], TODAY)).toEqual([])
  })

  it('should stop at a price that jumped, so an old plan does not count', () => {
    const rows = [charge('2026-06-10', -500), charge('2026-07-10', -500), charge('2026-08-10', -1399), charge('2026-09-10', -1399), charge('2026-10-10', -1399)]
    expect(detectSubscriptions(rows, TODAY)[0]).toMatchObject({ count: 3, amountCents: 1399 })
  })
})
