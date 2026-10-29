import { describe, expect, it } from 'vitest'
import { bankAfterKindChange, banksFor } from './banks'
import type { InstitutionSummary } from '../../../shared/ledger'

const bank = (id: string, over: Partial<InstitutionSummary> = {}): InstitutionSummary => ({
  id, name: id, kind: 'BANK', statementPreset: null, archived: false, accountCount: 0, ...over,
})
const list = [
  bank('alpha'),
  bank('old', { archived: true }),
  bank('edenred', { kind: 'VOUCHER_ISSUER' }),
  bank('up', { kind: 'VOUCHER_ISSUER' }),
]
const ids = (l: InstitutionSummary[]) => l.map(b => b.id)

describe('banksFor', () => {
  it('should offer active banks of the kind, in order', () => {
    expect(ids(banksFor(list, 'BANK'))).toEqual(['alpha'])
    expect(ids(banksFor(list, 'VOUCHER_ISSUER'))).toEqual(['edenred', 'up'])
  })

  it('should keep an archived bank that is chosen or saved', () => {
    expect(ids(banksFor(list, 'BANK', [null, 'old']))).toEqual(['alpha', 'old'])
  })
})

describe('bankAfterKindChange', () => {
  it('should keep a bank that still fits', () => {
    expect(bankAfterKindChange(list, 'alpha', 'CREDIT_CARD')).toBe('alpha')
    expect(bankAfterKindChange(list, 'up', 'MEAL_VOUCHER')).toBe('up')
  })

  it('should pick the first issuer for a meal-voucher card, and no bank when a card stops being one', () => {
    expect(bankAfterKindChange(list, null, 'MEAL_VOUCHER')).toBe('edenred')
    expect(bankAfterKindChange(list, 'alpha', 'MEAL_VOUCHER')).toBe('edenred')
    expect(bankAfterKindChange(list, 'edenred', 'CURRENT')).toBeNull()
    expect(bankAfterKindChange([bank('alpha')], null, 'MEAL_VOUCHER')).toBeNull()
  })
})
