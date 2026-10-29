import { describe, expect, it } from 'vitest'
import {
  canSendTransfer,
  centsToInput,
  defaultAccountId,
  defaultToAccountId,
  draftFromRow,
  findCategory,
  groupsFor,
  isImportable,
  parseAccountDraft,
  validateEntry,
  voucherShortfall,
  type EntryDraft,
} from './ledger'
import { matchShortcut } from '../hooks/useShortcuts'
import type { AccountSummary, CategoryNode, TransactionRow } from '../../../shared/ledger'

const account = (id: string, kind: AccountSummary['kind'] = 'CURRENT', archived = false): AccountSummary => ({
  id, name: id, kind, institution: 'OTHER', currency: 'EUR', openingBalanceCents: 0, openingDate: '2026-10-01',
  balanceCents: 0, transactionCount: 0, importedUntil: null, archived,
  holderMemberId: null, holderName: null, holderColour: null, cards: [],
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
  kind: 'EXPENSE', amount: '12,50', accountId: 'a', toAccountId: '', categoryId: 'power', payee: '', note: '', bookedAt: '2026-10-26', memberId: null, ...patch,
})

describe('categories for a picker', () => {
  it('should offer only income groups for income and the rest for an expense, skipping empty groups', () => {
    expect(groupsFor(tree, 'INCOME').map(g => g.id)).toEqual(['income'])
    expect(groupsFor(tree, 'EXPENSE').map(g => g.id)).toEqual(['bills'])
    expect(groupsFor(tree, 'ANY').map(g => g.id)).toEqual(['income', 'bills'])
    expect(groupsFor(tree, 'BILL').map(g => g.id)).toEqual(['bills'])
    expect(groupsFor(tree, 'SUBSCRIPTION')).toEqual([])
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

  it('should never pick a meal-voucher card as where a transfer goes', () => {
    expect(defaultToAccountId([account('bank'), account('edenred', 'MEAL_VOUCHER'), account('savings', 'SAVINGS')], 'bank')).toBe('savings')
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
    memberId: 'm1', memberName: 'Maria', memberColour: 'purple', createdByName: 'Andreas',
  }

  it('should turn a negative row into an expense with a plain amount', () => {
    expect(draftFromRow(row)).toMatchObject({ kind: 'EXPENSE', amount: '1234,05', accountId: 'bank', payee: 'Lidl', memberId: 'm1' })
    expect(centsToInput(5)).toBe('0,05')
  })

  it('should read both sides of a transfer as from → to', () => {
    const incoming = { ...row, amountCents: 5000, accountId: 'cash', transferId: 't', transferAccountId: 'bank' }
    expect(draftFromRow(incoming)).toMatchObject({ kind: 'TRANSFER', accountId: 'bank', toAccountId: 'cash' })
    const outgoing = { ...row, amountCents: -5000, transferId: 't', transferAccountId: 'cash' }
    expect(draftFromRow(outgoing)).toMatchObject({ kind: 'TRANSFER', accountId: 'bank', toAccountId: 'cash' })
  })
})

describe('meal-voucher cards', () => {
  it('should be entered by hand and never be the source of a transfer', () => {
    expect(['CURRENT', 'CREDIT_CARD', 'CASH', 'MEAL_VOUCHER'].map(k => isImportable(k as AccountSummary['kind']))).toEqual([true, true, false, false])
    expect(canSendTransfer('MEAL_VOUCHER')).toBe(false)
    expect(canSendTransfer('CASH')).toBe(true)
  })

  it('should warn when an expense takes the card below zero, counting an edited row only once', () => {
    const card = { ...account('card', 'MEAL_VOUCHER'), balanceCents: 1_000 }
    const accounts = [card, account('bank')]
    expect(voucherShortfall(accounts, draft({ accountId: 'card', amount: '10,00' }), null)).toBeNull()
    expect(voucherShortfall(accounts, draft({ accountId: 'card', amount: '12,50' }), null)).toBe(-250)
    expect(voucherShortfall(accounts, draft({ accountId: 'card', amount: '12,50', kind: 'INCOME' }), null)).toBeNull()
    expect(voucherShortfall(accounts, draft({ accountId: 'bank', amount: '99,00' }), null)).toBeNull()
    // The card already shows the edited row's -5,00; raising it to 12,50 leaves 15,00 - 12,50
    const edited = { id: 'r', accountId: 'card', amountCents: -500, transferId: null } as TransactionRow
    expect(voucherShortfall(accounts, draft({ accountId: 'card', amount: '12,50' }), edited)).toBeNull()
  })
})

describe('parseAccountDraft', () => {
  const base = { name: ' Alpha ', kind: 'CREDIT_CARD' as const, institution: 'ALPHA' as const, openingBalance: '-350,00', openingDate: '2026-10-01', holderMemberId: null, cards: [] }

  it('should keep a negative card balance and treat an empty balance as zero', () => {
    expect(parseAccountDraft(base)).toEqual({
      input: { name: 'Alpha', kind: 'CREDIT_CARD', institution: 'ALPHA', openingBalanceCents: -35000, openingDate: '2026-10-01', holderMemberId: null, cards: [] },
    })
    expect(parseAccountDraft({ ...base, openingBalance: '' })).toMatchObject({ input: { openingBalanceCents: 0 } })
  })

  it('should name what is wrong', () => {
    expect(parseAccountDraft({ ...base, name: '', openingBalance: 'x' })).toEqual({ errors: { name: 'name_required', openingBalance: 'amount_invalid' } })
  })

  it('should keep the card list in order, with ids only for saved cards', () => {
    const cards = [{ key: 'a', id: 'c1', last4: ' 1234', holderMemberId: 'm1' }, { key: 'b', last4: '5678', holderMemberId: null }]
    expect(parseAccountDraft({ ...base, holderMemberId: 'm1', cards })).toMatchObject({
      input: { holderMemberId: 'm1', cards: [{ id: 'c1', last4: '1234', holderMemberId: 'm1' }, { last4: '5678', holderMemberId: null }] },
    })
  })

  it('should flag card digits that are not 4 digits, and a card listed twice', () => {
    const cards = [{ key: 'a', last4: '12a4', holderMemberId: null }, { key: 'b', last4: '5678', holderMemberId: null }, { key: 'c', last4: '5678', holderMemberId: null }]
    expect(parseAccountDraft({ ...base, cards })).toEqual({ errors: { cards: { a: 'card_last4', c: 'card_duplicate' } } })
  })

  it('should ask whose a meal-voucher card is when parents exist, and keep only a voucher issuer', () => {
    const voucher = { ...base, kind: 'MEAL_VOUCHER' as const, openingBalance: '120,00' }
    expect(parseAccountDraft(voucher, true)).toEqual({ errors: { holder: 'holder_required' } })
    expect(parseAccountDraft(voucher)).toMatchObject({ input: { institution: 'OTHER' } })
    expect(parseAccountDraft({ ...voucher, institution: 'UP_HELLAS', holderMemberId: 'm1' }, true)).toMatchObject({ input: { institution: 'UP_HELLAS' } })
  })

  it('should drop the cards of an account that becomes cash', () => {
    const cards = [{ key: 'a', last4: '12', holderMemberId: null }]
    expect(parseAccountDraft({ ...base, kind: 'CASH', cards })).toMatchObject({ input: { cards: [] } })
  })
})

describe('Ctrl+N', () => {
  it('should add a transaction on any keyboard layout', () => {
    expect(matchShortcut({ key: 'ν', code: 'KeyN', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe('addTransaction')
    expect(matchShortcut({ key: 'N', code: 'KeyN', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })).toBeNull()
  })
})
