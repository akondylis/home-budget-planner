import { describe, expect, it } from 'vitest'
import {
  centsToInput,
  defaultAccountId,
  defaultToAccountId,
  draftFromRow,
  findCategory,
  groupsFor,
  parseAccountDraft,
  validateEntry,
  type EntryDraft,
} from './ledger'
import { matchShortcut } from '../hooks/useShortcuts'
import type { AccountSummary, CategoryNode, TransactionRow } from '../../../shared/ledger'

const account = (id: string, kind: AccountSummary['kind'] = 'CURRENT', archived = false): AccountSummary => ({
  id, name: id, kind, institution: 'OTHER', currency: 'EUR', openingBalanceCents: 0, openingDate: '2026-10-01',
  balanceCents: 0, transactionCount: 0, importedUntil: null, archived,
})

const node = (id: string, type: CategoryNode['type'], children: CategoryNode[] = []): CategoryNode => ({
  id, name: id, type, icon: null, parentId: null, sortOrder: 0, children,
})
const tree = [
  node('income', 'INCOME', [node('salary', 'INCOME')]),
  node('bills', 'BILL', [node('power', 'BILL')]),
  node('empty', 'SAVINGS'),
]

const draft = (patch: Partial<EntryDraft> = {}): EntryDraft => ({
  kind: 'EXPENSE', amount: '12,50', accountId: 'a', toAccountId: '', categoryId: 'power', payee: '', note: '', bookedAt: '2026-10-26', ...patch,
})

describe('categories for a picker', () => {
  it('should offer only income groups for income and the rest for an expense, skipping empty groups', () => {
    expect(groupsFor(tree, 'INCOME').map(g => g.id)).toEqual(['income'])
    expect(groupsFor(tree, 'EXPENSE').map(g => g.id)).toEqual(['bills'])
    expect(groupsFor(tree, 'ANY').map(g => g.id)).toEqual(['income', 'bills'])
  })

  it('should find groups and categories by id', () => {
    expect(findCategory(tree, 'power')?.type).toBe('BILL')
    expect(findCategory(tree, 'bills')?.id).toBe('bills')
    expect(findCategory(tree, null)).toBeNull()
  })
})

describe('entry defaults', () => {
  const accounts = [account('bank'), account('old', 'CURRENT', true), account('cash', 'CASH')]

  it('should start in the asked account, else the last used, else the first active one', () => {
    expect(defaultAccountId(accounts, 'cash', 'bank')).toBe('cash')
    expect(defaultAccountId(accounts, null, 'cash')).toBe('cash')
    expect(defaultAccountId(accounts, 'old', 'gone')).toBe('bank')
    expect(defaultAccountId([], null, null)).toBe('')
  })

  it('should send a transfer to Cash unless the money leaves Cash', () => {
    expect(defaultToAccountId(accounts, 'bank')).toBe('cash')
    expect(defaultToAccountId(accounts, 'cash')).toBe('bank')
  })
})

describe('validateEntry', () => {
  it('should accept a complete expense', () => {
    expect(validateEntry(draft())).toEqual({})
  })

  it('should explain each missing or wrong field', () => {
    expect(validateEntry(draft({ amount: '' })).amount).toBe('amount_required')
    expect(validateEntry(draft({ amount: '0' })).amount).toBe('amount_invalid')
    expect(validateEntry(draft({ amount: '-5' })).amount).toBe('amount_invalid')
    expect(validateEntry(draft({ amount: 'abc' })).amount).toBe('amount_invalid')
    expect(validateEntry(draft({ categoryId: null })).categoryId).toBe('category_required')
    expect(validateEntry(draft({ bookedAt: '' })).bookedAt).toBe('date_required')
  })

  it('should need two different accounts and no category for a transfer', () => {
    expect(validateEntry(draft({ kind: 'TRANSFER', categoryId: null, toAccountId: 'b' }))).toEqual({})
    expect(validateEntry(draft({ kind: 'TRANSFER', toAccountId: 'a' })).toAccountId).toBe('same_account')
    expect(validateEntry(draft({ kind: 'TRANSFER', toAccountId: '' })).toAccountId).toBe('account_required')
  })
})

describe('draftFromRow', () => {
  const row: TransactionRow = {
    id: 'r', accountId: 'bank', accountName: 'Bank', bookedAt: '2026-10-05', amountCents: -123405, description: '', payee: 'Lidl',
    note: null, categoryId: 'power', categoryName: 'power', categoryGroupName: 'bills', categoryType: 'BILL',
    transferId: null, transferAccountId: null, transferAccountName: null, importBatchId: null,
  }

  it('should turn a negative row into an expense with a plain amount', () => {
    expect(draftFromRow(row)).toMatchObject({ kind: 'EXPENSE', amount: '1234,05', accountId: 'bank', payee: 'Lidl' })
    expect(centsToInput(5)).toBe('0,05')
  })

  it('should read both sides of a transfer as from → to', () => {
    const incoming = { ...row, amountCents: 5000, accountId: 'cash', transferId: 't', transferAccountId: 'bank' }
    expect(draftFromRow(incoming)).toMatchObject({ kind: 'TRANSFER', accountId: 'bank', toAccountId: 'cash' })
    const outgoing = { ...row, amountCents: -5000, transferId: 't', transferAccountId: 'cash' }
    expect(draftFromRow(outgoing)).toMatchObject({ kind: 'TRANSFER', accountId: 'bank', toAccountId: 'cash' })
  })
})

describe('parseAccountDraft', () => {
  const base = { name: ' Alpha ', kind: 'CREDIT_CARD' as const, institution: 'ALPHA' as const, openingBalance: '-350,00', openingDate: '2026-10-01' }

  it('should keep a negative card balance and treat an empty balance as zero', () => {
    expect(parseAccountDraft(base)).toEqual({ input: { name: 'Alpha', kind: 'CREDIT_CARD', institution: 'ALPHA', openingBalanceCents: -35000, openingDate: '2026-10-01' } })
    expect(parseAccountDraft({ ...base, openingBalance: '' })).toMatchObject({ input: { openingBalanceCents: 0 } })
  })

  it('should name what is wrong', () => {
    expect(parseAccountDraft({ ...base, name: '', openingBalance: 'x' })).toEqual({ errors: { name: 'name_required', openingBalance: 'amount_invalid' } })
  })
})

describe('Ctrl+N', () => {
  it('should add a transaction on any keyboard layout', () => {
    expect(matchShortcut({ key: 'ν', code: 'KeyN', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe('addTransaction')
    expect(matchShortcut({ key: 'N', code: 'KeyN', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })).toBeNull()
  })
})
