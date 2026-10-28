import { describe, expect, it } from 'vitest'
import { EMPTY_ACCOUNT_FILTER, JOINT, applicableFilter, filterAccounts, groupAccounts, isAccountFilterActive, presentValues } from './account-groups'
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

  it('should match every set field', () => {
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, institution: 'ALPHA' }))).toEqual(['alpha-joint', 'alpha-mum'])
    expect(ids(filterAccounts(accounts, { kind: 'SAVINGS', institution: 'ALPHA', holder: null }))).toEqual(['alpha-mum'])
    expect(filterAccounts(accounts, { kind: 'CASH', institution: 'ALPHA', holder: null })).toEqual([])
  })

  it('should count a card of theirs on a joint account as the holder\'s', () => {
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, holder: 'dad' }))).toEqual(['euro-card', 'alpha-joint'])
  })

  it('should match joint accounts by the missing holder', () => {
    expect(ids(filterAccounts(accounts, { ...EMPTY_ACCOUNT_FILTER, holder: JOINT }))).toEqual(['cash', 'alpha-joint'])
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
  it('should offer only what occurs, holders from cards included', () => {
    const values = presentValues(accounts.slice(1, 3), members)
    expect(values.kinds).toEqual(['CURRENT', 'CREDIT_CARD'])
    expect(values.institutions).toEqual(['ALPHA', 'EUROBANK'])
    expect(values.holders.map(h => h.id)).toEqual(['dad', JOINT])
  })
})

describe('applicableFilter', () => {
  const values = presentValues(accounts, members)

  it('should keep a choice that is offered', () => {
    const filter = { kind: 'CASH' as const, institution: 'ALPHA' as const, holder: 'dad' }
    expect(applicableFilter(filter, values, true)).toEqual(filter)
  })

  it('should drop a choice whose value is gone or whose control is hidden', () => {
    expect(applicableFilter({ ...EMPTY_ACCOUNT_FILTER, holder: 'gone' }, values, true).holder).toBeNull()
    expect(applicableFilter({ ...EMPTY_ACCOUNT_FILTER, holder: 'dad' }, values, false).holder).toBeNull()
    const oneBank = presentValues([accounts[2], accounts[3]], members)
    expect(applicableFilter({ ...EMPTY_ACCOUNT_FILTER, institution: 'ALPHA' }, oneBank, true).institution).toBeNull()
  })
})
