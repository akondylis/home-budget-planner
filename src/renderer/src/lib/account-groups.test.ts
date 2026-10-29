import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import {
  EMPTY_ACCOUNT_FILTER, JOINT, applicableFilter, countAccountFilters, describeAccountFilters, filterAccounts, groupAccounts,
  isAccountFilterActive, presentValues, toggleValue,
} from './account-groups'
import type { AccountSummary } from '../../../shared/ledger'
import type { MemberSummary } from '../../../shared/members'

const member = (id: string): MemberSummary => ({ id, name: id, colour: 'blue', archived: false, transactionCount: 0, accountCount: 0 })
const members = [member('mum'), member('dad')]

const account = (id: string, over: Partial<AccountSummary> = {}): AccountSummary => ({
  id,
  name: id,
  kind: 'CURRENT',
  institution: 'ALPHA',
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
  account('cash', { kind: 'CASH', institution: 'OTHER', balanceCents: 5000 }),
  account('euro-card', { kind: 'CREDIT_CARD', institution: 'EUROBANK', balanceCents: -30000, holderMemberId: 'dad', holderName: 'dad', holderColour: 'blue' }),
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
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, institutions: ['ALPHA'] }))).toEqual(['alpha-joint', 'alpha-mum'])
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, institutions: ['EUROBANK', 'OTHER'] }))).toEqual(['cash', 'euro-card'])
    expect(ids(filterAccounts(accounts, { kinds: ['SAVINGS', 'CASH'], institutions: ['ALPHA'], holders: [] }))).toEqual(['alpha-mum'])
    expect(filterAccounts(accounts, { kinds: ['CASH'], institutions: ['ALPHA'], holders: [] })).toEqual([])
  })

  it('should count a parent\'s card on a joint account as theirs', () => {
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, holders: ['dad'] }))).toEqual(['euro-card', 'alpha-joint'])
  })

  it('should match joint accounts by the missing holder', () => {
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, holders: [JOINT] }))).toEqual(['cash', 'alpha-joint'])
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, holders: [JOINT, 'mum'] }))).toEqual(['cash', 'alpha-joint', 'alpha-mum'])
  })

  it('should count every chosen value and toggle one', () => {
    expect(countAccountFilters({ kinds: ['CASH'], institutions: ['ALPHA', 'EUROBANK'], holders: [] })).toBe(3)
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

  it('should order banks as declared, Other last, with subtotals', () => {
    const groups = groupAccounts(accounts, 'institution', members)
    expect(groups.map(g => [g.key, g.totalCents])).toEqual([['ALPHA', 320000], ['EUROBANK', -30000], ['OTHER', 5000]])
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
      expect(groupAccounts(accounts, by, members).reduce((sum, g) => sum + g.totalCents, 0)).toBe(295000)
    }
  })
})

describe('presentValues', () => {
  it('should offer only what occurs with its count, holders from cards included', () => {
    const values = presentValues(accounts.slice(1, 3), members)
    expect(values.kinds).toEqual([{ value: 'CURRENT', count: 1 }, { value: 'CREDIT_CARD', count: 1 }])
    expect(values.institutions.map(v => v.value)).toEqual(['ALPHA', 'EUROBANK'])
    expect(values.holders.map(h => [h.id, h.count])).toEqual([['dad', 2], [JOINT, 1]])
  })
})

describe('applicableFilter', () => {
  const values = presentValues(accounts, members)

  it('should keep choices that are offered', () => {
    const filter = { kinds: ['CASH' as const], institutions: ['ALPHA' as const, 'EUROBANK' as const], holders: ['dad', JOINT] }
    expect(applicableFilter(filter, values, true)).toEqual(filter)
  })

  it('should drop values that are gone and sections that are hidden', () => {
    expect(applicableFilter({ ...EMPTY_ACCOUNT_FILTER, holders: ['gone', 'dad'] }, values, true).holders).toEqual(['dad'])
    expect(applicableFilter({ ...EMPTY_ACCOUNT_FILTER, holders: ['dad'] }, values, false).holders).toEqual([])
    const oneBank = presentValues([accounts[2], accounts[3]], members)
    expect(applicableFilter({ ...EMPTY_ACCOUNT_FILTER, institutions: ['ALPHA'] }, oneBank, true).institutions).toEqual([])
  })
})

describe('describeAccountFilters', () => {
  const t = i18next.t.bind(i18next)
  const values = presentValues(accounts, members)
  const filter = { kinds: ['CASH' as const], institutions: ['ALPHA' as const], holders: ['dad', JOINT] }

  it('should give one pill per chosen value, in section order', () => {
    const pills = describeAccountFilters(filter, t, values)
    expect(pills.map(p => p.key)).toEqual(['kind-CASH', 'bank-ALPHA', 'holder-dad', `holder-${JOINT}`])
    expect(pills[2].label).toBe('dad')
  })

  it('should clear only its own value', () => {
    const [, bank, dad] = describeAccountFilters(filter, t, values)
    expect(bank.clear(filter)).toEqual({ ...filter, institutions: [] })
    expect(dad.clear(filter).holders).toEqual([JOINT])
  })
})
