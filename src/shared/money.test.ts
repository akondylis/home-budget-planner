import { afterEach, describe, expect, it } from 'vitest'
import { formatMoney, parseMoney, setMoneyLanguage, sumMoney } from './money'

// Intl inserts narrow/normal no-break spaces; compare on plain spaces
const plain = (s: string) => s.replace(/[  ]/g, ' ')

afterEach(() => setMoneyLanguage('el'))

describe('formatMoney', () => {
  it('should format cents in Greek by default', () => {
    expect(plain(formatMoney(123456))).toBe('1.234,56 €')
  })

  it('should format cents in English when the language is en', () => {
    setMoneyLanguage('en')
    expect(formatMoney(123456)).toBe('€1,234.56')
  })

  it('should show the sign on both sides when sign is always', () => {
    setMoneyLanguage('en')
    expect(formatMoney(500, { sign: 'always' })).toBe('+€5.00')
    expect(formatMoney(-500, { sign: 'always' })).toBe('-€5.00')
  })

  it('should round to whole units when asked, without touching the default', () => {
    expect(plain(formatMoney(123456, { whole: true }))).toBe('1.235 €')
    expect(plain(formatMoney(123456))).toBe('1.234,56 €')
  })

  it('should return an empty string when the value is missing', () => {
    expect(formatMoney(null)).toBe('')
    expect(formatMoney(undefined)).toBe('')
    expect(formatMoney(Number.NaN)).toBe('')
  })
})

describe('parseMoney', () => {
  it.each([
    ['1234,5', 123450],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['12', 1200],
    ['-12,30', -1230],
    ['€ 9.99', 999],
    ['0,05', 5],
  ])('should parse %s as %i cents', (input, cents) => {
    expect(parseMoney(input)).toBe(cents)
  })

  it('should return null when the input is not a number', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('1,2,3a')).toBeNull()
  })
})

describe('sumMoney', () => {
  it('should add cents exactly where floats would drift', () => {
    expect(sumMoney([10, 20, null, 70])).toBe(100)
    expect(sumMoney(Array(10).fill(10))).toBe(100)
  })
})
