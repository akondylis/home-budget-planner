import { describe, expect, it } from 'vitest'
import { entryFormat, entryOrder, formatDate, parseDate } from './date-format'

const today = new Date(2026, 9, 26)

describe('parseDate', () => {
  it('should read day first for the day-first formats', () => {
    expect(parseDate('5/3/2026', 'dd/MM/yyyy', today)).toBe('2026-03-05')
    expect(parseDate('05.03.2026', 'dd.MM.yyyy', today)).toBe('2026-03-05')
    expect(parseDate('05-03-26', 'dd-MM-yyyy', today)).toBe('2026-03-05')
    expect(parseDate('05 03 2026', 'dd MMMM yyyy', today)).toBe('2026-03-05')
  })

  it('should follow the order of the US and ISO formats', () => {
    expect(parseDate('3/5/2026', 'MM/dd/yyyy', today)).toBe('2026-03-05')
    expect(parseDate('2026-03-05', 'yyyy-MM-dd', today)).toBe('2026-03-05')
    expect(parseDate('03-05', 'yyyy-MM-dd', today)).toBeNull()
  })

  it('should use the current year when the year is left out', () => {
    expect(parseDate('31/12', 'dd/MM/yyyy', today)).toBe('2026-12-31')
  })

  it('should reject days that do not exist and text that is not a date', () => {
    expect(parseDate('31/04/2026', 'dd/MM/yyyy', today)).toBeNull()
    expect(parseDate('29/02/2026', 'dd/MM/yyyy', today)).toBeNull()
    expect(parseDate('29/02/2028', 'dd/MM/yyyy', today)).toBe('2028-02-29')
    expect(parseDate('5/3/202', 'dd/MM/yyyy', today)).toBeNull()
    expect(parseDate('today', 'dd/MM/yyyy', today)).toBeNull()
    expect(parseDate('', 'dd/MM/yyyy', today)).toBeNull()
    expect(parseDate('5', 'dd/MM/yyyy', today)).toBeNull()
  })

  it('should type month-name formats as numbers, day first', () => {
    expect(entryOrder('dd MMM yyyy')).toBe('DMY')
    expect(entryFormat('dd MMM yyyy')).toBe('dd/MM/yyyy')
    expect(entryFormat('MM/dd/yyyy')).toBe('MM/dd/yyyy')
  })
})

describe('formatDate with a calendar day', () => {
  it('should show the same day it was given, whatever the time zone', () => {
    expect(formatDate('2026-03-05', 'dd/MM/yyyy')).toBe('05/03/2026')
  })
})
