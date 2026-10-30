import { describe, expect, it } from 'vitest'
import {
  compareRangeFor,
  csvMoney,
  groupByQuarter,
  lastYearRange,
  monthsIn,
  presetRange,
  previousRange,
  rangeDays,
  rankRows,
  sharePercent,
  toCsv,
  type TrendRow,
} from './reports'

describe('periods', () => {
  it('should cover the right days for each preset', () => {
    const today = '2026-03-15'
    // Periods that include today end today, so comparisons cover the same days
    expect(presetRange('THIS_MONTH', today)).toEqual({ from: '2026-03-01', to: '2026-03-15' })
    expect(presetRange('LAST_MONTH', today)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(presetRange('THIS_YEAR', today)).toEqual({ from: '2026-01-01', to: '2026-03-15' })
    expect(presetRange('LAST_12', today)).toEqual({ from: '2025-04-01', to: '2026-03-15' })
    expect(presetRange('LAST_YEAR', today)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(presetRange('LAST_MONTH', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('should compare with the same number of days before, or the same dates last year', () => {
    const march = { from: '2026-03-01', to: '2026-03-31' }
    expect(rangeDays(march)).toBe(31)
    expect(previousRange(march)).toEqual({ from: '2026-01-29', to: '2026-02-28' })
    expect(lastYearRange({ from: '2028-02-01', to: '2028-02-29' })).toEqual({ from: '2027-02-01', to: '2027-02-28' })
    expect(compareRangeFor('NONE', march)).toBeNull()
    expect(compareRangeFor('LAST_YEAR', march)).toEqual({ from: '2025-03-01', to: '2025-03-31' })
  })

  it('should list the months a range touches', () => {
    expect(monthsIn({ from: '2025-11-20', to: '2026-02-03' })).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('report maths', () => {
  it('should group months into quarters, summing each', () => {
    const month = (key: string, inCents: number): TrendRow => ({ key, range: { from: `${key}-01`, to: `${key}-28` }, inCents, outCents: 10, netCents: inCents - 10, count: 1 })
    const q = groupByQuarter([month('2026-01', 100), month('2026-02', 200), month('2026-04', 50)])
    expect(q.map(r => [r.key, r.inCents, r.outCents, r.count])).toEqual([['2026-Q1', 300, 20, 2], ['2026-Q2', 50, 10, 1]])
    expect(q[0].range).toEqual({ from: '2026-01-01', to: '2026-02-28' })
  })

  it('should rank largest first and break ties by name', () => {
    expect(rankRows([{ name: 'b', cents: 5 }, { name: 'a', cents: 5 }, { name: 'c', cents: 9 }]).map(r => r.name)).toEqual(['c', 'a', 'b'])
  })

  it('should give whole percentages, 0 of nothing', () => {
    expect([sharePercent(333, 1_000), sharePercent(5, 0)]).toEqual([33, 0])
  })
})

describe('CSV', () => {
  it('should write amounts for a Greek or English spreadsheet', () => {
    expect([csvMoney(123_456, 'el'), csvMoney(-5, 'el'), csvMoney(123_456, 'en')]).toEqual(['1234,56', '-0,05', '1234.56'])
  })

  it('should start with a BOM, use ; and CRLF, and quote what needs it', () => {
    const csv = toCsv([['Κατηγορία', 'Ποσό'], ['Σούπερ; μάρκετ', '12,50'], ['Say "hi"', null]])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1)).toBe('Κατηγορία;Ποσό\r\n"Σούπερ; μάρκετ";12,50\r\n"Say ""hi""";\r\n')
  })
})
