import { describe, it, expect } from 'vitest'
import { normalise } from './search-normalise'

describe('normalise', () => {
  it('folds Greek to Latin and drops accents and case', () => {
    expect(normalise('Σούπερ μάρκετ')).toBe('souper market')
    expect(normalise('ΡΥΘΜΙΣΕΙΣ')).toBe(normalise('ρυθμίσεις'))
    expect(normalise('Café')).toBe('cafe')
  })

  it('collapses punctuation and spaces', () => {
    expect(normalise('  Accounts & cards ')).toBe('accounts cards')
  })
})
