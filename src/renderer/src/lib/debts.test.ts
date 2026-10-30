import { describe, expect, it } from 'vitest'
import {
  debtTotals,
  draftPreview,
  draftToDebtInput,
  emptyDebtDraft,
  monthsBetween,
  parseRate,
  planInput,
  rateToInput,
  validateDebtDraft,
  type DebtDraft,
} from './debts'
import type { DebtRow } from '../../../shared/debt'

const draft = (over: Partial<DebtDraft>): DebtDraft => ({ ...emptyDebtDraft('2026-10-20'), name: 'Car loan', principal: '10.000,00', ...over })

const row = (over: Partial<DebtRow>): DebtRow => ({
  id: 'd', name: 'Loan', kind: 'LOAN', direction: 'WE_OWE', counterparty: null, institutionId: null, institutionName: null,
  principalCents: 100_000, rateBp: 500, termMonths: 12, instalmentCents: 8_561, startDate: '2026-01-05', accountId: null,
  accountName: null, memberId: null, categoryId: null, categoryName: null, matchText: null, remindDays: null, note: null,
  ruleId: 'r', archived: false, remainingCents: 50_000, balanceOverride: null, paidCount: 6,
  nextDue: { date: '2026-11-05', amountCents: 8_561, status: 'UPCOMING' }, payoffDate: '2027-04-05', neverEnds: false,
  interestToGoCents: 900, progress: 0.5, ...over,
})

describe('rate text', () => {
  it('should read a Greek or English rate as basis points and write it back', () => {
    expect(parseRate('5,25')).toBe(525)
    expect(parseRate('5.25 %')).toBe(525)
    expect(parseRate('')).toBe(0)
    expect(parseRate('abc')).toBeNull()
    expect(parseRate('120')).toBeNull()
    expect(rateToInput(525, 'el')).toBe('5,25')
    expect(rateToInput(600, 'en')).toBe('6')
  })
})

describe('debt form', () => {
  it('should start with the first instalment a month from today', () => {
    expect(emptyDebtDraft('2026-01-31').startDate).toBe('2026-02-28')
  })

  it('should show the instalment for a number of months, or the months for an instalment', () => {
    expect(draftPreview(draft({ rate: '6', months: '36' }))).toEqual({ instalmentCents: 30_422, months: 36, tooLow: false })
    expect(draftPreview(draft({ rate: '6', termMode: 'INSTALMENT', instalment: '304,22' }))).toEqual({ instalmentCents: 30_422, months: 36, tooLow: false })
    expect(draftPreview(draft({ rate: '12', termMode: 'INSTALMENT', instalment: '50' })).tooLow).toBe(true)
  })

  it('should ask for the months, a valid rate and, for card instalments, the card', () => {
    expect(validateDebtDraft(draft({ months: '' }))).toMatchObject({ months: 'months_invalid' })
    expect(validateDebtDraft(draft({ months: '12', rate: 'x' }))).toMatchObject({ rate: 'rate_invalid' })
    expect(validateDebtDraft(draft({ kind: 'INSTALMENTS', months: '12' }))).toMatchObject({ accountId: 'card_required' })
    expect(validateDebtDraft(draft({ rate: '12', termMode: 'INSTALMENT', instalment: '50' }))).toMatchObject({ instalment: 'instalment_too_low' })
    expect(validateDebtDraft(draft({ kind: 'PERSONAL' }))).toEqual({})
  })

  it('should send only what the kind has', () => {
    expect(draftToDebtInput(draft({ kind: 'INSTALMENTS', rate: '9', months: '24', accountId: 'card', institutionId: 'inst_alpha' })))
      .toMatchObject({ rateBp: 0, termMonths: 24, instalmentCents: null, institutionId: null, accountId: 'card' })
    expect(draftToDebtInput(draft({ kind: 'PERSONAL', direction: 'OWED_TO_US', repays: true, months: '5' })))
      .toMatchObject({ direction: 'OWED_TO_US', termMonths: null, instalmentCents: null })
    expect(draftToDebtInput(draft({ rate: '6', termMode: 'INSTALMENT', instalment: '304,22' })))
      .toMatchObject({ rateBp: 600, termMonths: null, instalmentCents: 30_422 })
  })
})

describe('page figures', () => {
  it('should add up what we owe, what is owed to us and the latest payoff', () => {
    const totals = debtTotals([
      row({ id: 'a' }),
      row({ id: 'b', remainingCents: 20_000, payoffDate: '2028-01-05' }),
      row({ id: 'c', direction: 'OWED_TO_US', remainingCents: 30_000, instalmentCents: null, nextDue: null, payoffDate: null }),
      row({ id: 'd', archived: true, remainingCents: 99_000 }),
    ])
    expect(totals).toEqual({ weOweCents: 70_000, owedToUsCents: 30_000, monthlyCents: 17_122, debtFreeDate: '2028-01-05', someNeverEnd: false })
  })

  it('should leave debts with no instalment, owed to us or never ending out of the plan', () => {
    const { plan, left } = planInput([
      row({ id: 'a' }),
      row({ id: 'b', instalmentCents: null }),
      row({ id: 'c', direction: 'OWED_TO_US' }),
      row({ id: 'd', neverEnds: true }),
      row({ id: 'e', remainingCents: 0 }),
    ])
    expect(plan.map(p => p.id)).toEqual(['a'])
    expect(left.map(d => d.id)).toEqual(['b', 'c', 'd'])
  })

  it('should count months between two months', () => {
    expect(monthsBetween('2026-11', '2028-01')).toBe(14)
  })
})
