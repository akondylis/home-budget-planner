import { describe, expect, it } from 'vitest'
import { chartMonthLabel, chartScale, labelEvery, niceStep } from './chart-scale'
import { repeatedPlanMonth } from './projection'
import type { Projection, ProjectionMonth } from '../../../shared/projection'

describe('chart scale', () => {
  it('should step in 1, 2 or 5 times a power of ten', () => {
    expect([niceStep(0.7), niceStep(13), niceStep(41), niceStep(70_000)]).toEqual([1, 20, 50, 100_000])
  })

  it('should always take in 0 and land on clean whole-euro ticks', () => {
    const s = chartScale([420_000, 310_000, 505_000])
    expect(s.min).toBe(0)
    expect(s.ticks).toContain(0)
    expect(s.max).toBeGreaterThanOrEqual(505_000)
    expect(s.ticks.every(v => v % 100 === 0)).toBe(true)
  })

  it('should reach below 0 when the balance does, and cope with a flat line', () => {
    const s = chartScale([50_000, -32_000])
    expect(s.min).toBeLessThanOrEqual(-32_000)
    expect(s.ticks).toContain(0)
    expect(chartScale([0, 0]).ticks.length).toBeGreaterThanOrEqual(2)
  })
})

describe('labels', () => {
  it('should add the year to January only', () => {
    expect(chartMonthLabel('2027-01', 'en')).toBe('Jan 27')
    expect(chartMonthLabel('2026-11', 'en')).toBe('Nov')
  })

  it('should thin the x labels on long horizons', () => {
    expect([labelEvery(7), labelEvery(13), labelEvery(25)]).toEqual([1, 2, 3])
  })

  it('should name the plan month repeated last, if any', () => {
    const month = (m: string, planMonth: string | null): ProjectionMonth => ({ month: m, planMonth, startCents: 0, inCents: 0, outCents: 0, endCents: 0, lines: [] })
    const p = { months: [month('2026-10', '2026-10'), month('2026-11', '2026-10'), month('2026-12', '2026-12'), month('2027-01', '2026-12')] } as Projection
    expect(repeatedPlanMonth(p)).toBe('2026-12')
    expect(repeatedPlanMonth({ months: [month('2026-10', null)] } as Projection)).toBeNull()
  })
})
