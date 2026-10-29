import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import {
  EMPTY_ACCOUNT_FILTER, JOINT, NO_BANK, applicableFilter, countAccountFilters, describeAccountFilters, filterAccounts, groupAccounts,
  isAccountFilterActive, presentValues, toggleValue,
} from './account-groups'
import type { AccountSummary, InstitutionSummary } from '../../../shared/ledger'
import type { MemberSummary } from '../../../shared/members'

const member = (id: string): MemberSummary => ({ id, name: id, colour: 'blue', archived: false, transactionCount: 0, accountCount: 0 })
const members = [member('mum'), member('dad')]

const bank = (id: string, name: string): InstitutionSummary => ({ id, name, kind: 'BANK', statementPreset: null, archived: false, accountCount: 0 })
// The user's order: a bank they added (Revolut) moved above Eurobank
const banks = [bank('alpha', 'Alpha Bank'), bank('revolut', 'Revolut'), bank('euro', 'Eurobank')]
const at = (id: string | null) => ({ institutionId: id, institutionName: banks.find(b => b.id === id)?.name ?? null })

const account = (id: string, over: Partial<AccountSummary> = {}): AccountSummary => ({
  id,
  name: id,
  kind: 'CURRENT',
  ...at('alpha'),
  currency: 'EUR',
  openingBalanceCents: 0,
  openingDate: '2026-01-01',
  balanceCents: 0,
  transactionCount: 0,
  importedUntil: null,
  archived: false,
  holderMemberId: null,
  holderName: null,
  holderColour: null,
  cards: [],
  ...over,
})

const dadsCard = { id: 'c1', last4: '1234', holderMemberId: 'dad', holderName: 'dad', holderColour: 'blue' as const }

const accounts = [
  account('cash', { kind: 'CASH', ...at(null), balanceCents: 5000 }),
  account('euro-card', { kind: 'CREDIT_CARD', ...at('euro'), balanceCents: -30000, holderMemberId: 'dad', holderName: 'dad', holderColour: 'blue' }),
  account('alpha-joint', { balanceCents: 120000, cards: [dadsCard] }),
  account('alpha-mum', { kind: 'SAVINGS', balanceCents: 200000, holderMemberId: 'mum', holderName: 'mum', holderColour: 'purple' }),
]
const ids = (list: { id: string }[]) => list.map(a => a.id)

describe('filterAccounts', () => {
  it('should keep everything without a filter', () => {
    expect(filterAccounts(accounts, EMPTY_ACCOUNT_FILTER)).toHaveLength(4)
    expect(isAccountFilterActive(EMPTY_ACCOUNT_FILTER)).toBe(false)
  })

  it('should take any value within a section and every section with a choice', () => {
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, institutions: ['alpha'] }))).toEqual(['alpha-joint', 'alpha-mum'])
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, institutions: ['euro', NO_BANK] }))).toEqual(['cash', 'euro-card'])
    expect(ids(filterAccounts(accounts, { kinds: ['SAVINGS', 'CASH'], institutions: ['alpha'], holders: [] }))).toEqual(['alpha-mum'])
    expect(filterAccounts(accounts, { kinds: ['CASH'], institutions: ['alpha'], holders: [] })).toEqual([])
  })

  it('should count a parent\'s card on a joint account as theirs', () => {
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, holders: ['dad'] }))).toEqual(['euro-card', 'alpha-joint'])
  })

  it('should match joint accounts by the missing holder', () => {
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, holders: [JOINT] }))).toEqual(['cash', 'alpha-joint'])
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, holders: [JOINT, 'mum'] }))).toEqual(['cash', 'alpha-joint', 'alpha-mum'])
  })

  it('should count every chosen value and toggle one', () => {
    expect(countAccountFilters({ kinds: ['CASH'], institutions: ['alpha', 'euro'], holders: [] })).toBe(3)
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleValue(['b'], 'a')).toEqual(['b', 'a'])
  })
})

describe('groupAccounts', () => {
  it('should give one group with the full total without grouping', () => {
    const [all] = groupAccounts(accounts, 'none', members)
    expect(all.accounts).toHaveLength(4)
    expect(all.totalCents).toBe(295000)
  })

  it('should order banks as the user ordered them, No bank last, with names and subtotals', () => {
    const groups = groupAccounts(accounts, 'institution', members, banks)
    expect(groups.map(g => [g.key, g.institutionName, g.totalCents])).toEqual([
      ['alpha', 'Alpha Bank', 320000], ['euro', 'Eurobank', -30000], [NO_BANK, null, 5000],
    ])
  })

  it('should group a bank added later, and one no longer listed after the listed ones', () => {
    const more = [...accounts, account('rev', { ...at('revolut'), balanceCents: 700 }), account('old', { institutionId: 'gone', institutionName: 'Old bank' })]
    expect(groupAccounts(more, 'institution', members, banks).map(g => g.key)).toEqual(['alpha', 'revolut', 'euro', 'gone', NO_BANK])
  })

  it('should order types as declared', () => {
    expect(groupAccounts(accounts, 'kind', members).map(g => g.key)).toEqual(['CURRENT', 'SAVINGS', 'CASH', 'CREDIT_CARD'])
  })

  it('should group by the account holder in member order, Joint last', () => {
    const groups = groupAccounts(accounts, 'holder', members)
    expect(groups.map(g => g.key)).toEqual(['mum', 'dad', JOINT])
    expect(ids(groups[2].accounts)).toEqual(['cash', 'alpha-joint'])
    expect(groups[0].holder).toEqual({ id: 'mum', name: 'mum', colour: 'purple' })
  })

  it('should keep subtotals adding up to the total', () => {
    for (const by of ['institution', 'holder', 'kind'] as const) {
      expect(groupAccounts(accounts, by, members, banks).reduce((sum, g) => sum + g.totalCents, 0)).toBe(295000)
    }
  })
})

describe('presentValues', () => {
  it('should offer only what occurs with its count, holders from cards included', () => {
    const values = presentValues(accounts.slice(1, 3), members, banks)
    expect(values.kinds).toEqual([{ value: 'CURRENT', count: 1 }, { value: 'CREDIT_CARD', count: 1 }])
    expect(values.institutions).toEqual([{ value: 'alpha', name: 'Alpha Bank', count: 1 }, { value: 'euro', name: 'Eurobank', count: 1 }])
    expect(values.holders.map(h => [h.id, h.count])).toEqual([['dad', 2], [JOINT, 1]])
  })
})

describe('applicableFilter', () => {
  const values = presentValues(accounts, members, banks)

  it('should keep choices that are offered', () => {
    const filter = { kinds: ['CASH' as const], institutions: ['alpha', NO_BANK], holders: ['dad', JOINT] }
    expect(applicableFilter(filter, values, true)).toEqual(filter)
  })

  it('should drop values that are gone and sections that are hidden', () => {
    expect(applicableFilter({ ...EMPTY_ACCOUNT_FILTER, holders: ['gone', 'dad'] }, values, true).holders).toEqual(['dad'])
    expect(applicableFilter({ ...EMPTY_ACCOUNT_FILTER, holders: ['dad'] }, values, false).holders).toEqual([])
    const oneBank = presentValues([accounts[2], accounts[3]], members, banks)
    expect(applicableFilter({ ...EMPTY_ACCOUNT_FILTER, institutions: ['alpha'] }, oneBank, true).institutions).toEqual([])
    // A filter saved before banks became a list holds the old enum values: they no longer occur
    expect(applicableFilter({ ...EMPTY_ACCOUNT_FILTER, institutions: ['ALPHA', 'euro'] }, values, true).institutions).toEqual(['euro'])
  })
})

describe('describeAccountFilters', () => {
  const t = i18next.t.bind(i18next)
  const values = presentValues(accounts, members, banks)
  const filter = { kinds: ['CASH' as const], institutions: ['alpha'], holders: ['dad', JOINT] }

  it('should give one pill per chosen value, in section order, banks by their name', () => {
    const pills = describeAccountFilters(filter, t, values)
    expect(pills.map(p => p.key)).toEqual(['kind-CASH', 'bank-alpha', 'holder-dad', `holder-${JOINT}`])
    expect(pills[1].label).toBe('Alpha Bank')
    expect(pills[2].label).toBe('dad')
  })

  it('should clear only its own value', () => {
    const [, bank, dad] = describeAccountFilters(filter, t, values)
    expect(bank.clear(filter)).toEqual({ ...filter, institutions: [] })
    expect(dad.clear(filter).holders).toEqual([JOINT])
  })
})
