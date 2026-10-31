import { describe, expect, it } from 'vitest'
import { findIbans, formatIban, isValidIban, normaliseIban } from './iban'

// Textbook examples (not anyone's account)
const GR = 'GR1601101250000000012300695'
const DE = 'DE89370400440532013000'

describe('iban', () => {
  it('normalises spaces, dashes and case', () => {
    expect(normaliseIban(' gr16 0110-1250 0000 0001 2300 695 ')).toBe(GR)
  })

  it('accepts valid IBANs and rejects a wrong check number or length', () => {
    expect(isValidIban(GR)).toBe(true)
    expect(isValidIban(DE)).toBe(true)
    expect(isValidIban('GR1701101250000000012300695')).toBe(false)
    expect(isValidIban('GR160110125000000001230069')).toBe(false)
    expect(isValidIban('not an iban')).toBe(false)
  })

  it('formats in groups of four', () => {
    expect(formatIban(GR)).toBe('GR16 0110 1250 0000 0001 2300 695')
  })

  it('finds valid IBANs in bank text only', () => {
    expect(findIbans(`Money out to IBAN - ${GR} - rent`)).toEqual([GR])
    expect(findIbans('Money out to IBAN - GR1701101250000000012300695')).toEqual([])
    expect(findIbans('ΑΓΟΡΑ ΣΚΛΑΒΕΝΙΤΗΣ')).toEqual([])
  })
})
