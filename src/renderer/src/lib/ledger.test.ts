import { describe, expect, it } from 'vitest'
import {
  bulkTransferAccounts,
  canSendTransfer,
  centsToInput,
  defaultAccountId,
  defaultToAccountId,
  draftFromRow,
  findCategory,
  groupsFor,
  isImportable,
  kindForAmount,
  kindForAmounts,
  parseAccountDraft,
  ruleMerchants,
  transferAccounts,
  validateEntry,
  voucherShortfall,
  type EntryDraft,
} from './ledger'
import { matchShortcut } from '../hooks/useShortcuts'
import type { AccountSummary, CategoryNode, TransactionRow } from '../../../shared/ledger'

const account = (id: string, kind: AccountSummary['kind'] = 'CURRENT', archived = false): AccountSummary => ({
  id, name: id, kind, institutionId: null, institutionName: null, currency: 'EUR', openingBalanceCents: 0, openingDate: '2026-10-01',
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

  it('should narrow the list by the direction of the money', () => {
    expect(kindForAmount(500)).toBe('INCOME')
    expect(kindForAmount(-500)).toBe('EXPENSE')
    expect(kindForAmounts([100, 200])).toBe('INCOME')
    expect(kindForAmounts([-100, -200])).toBe('EXPENSE')
    expect(kindForAmounts([100, -200])).toBe('ANY')
    expect(kindForAmounts([])).toBe('ANY')
  })
})

describe('transferAccounts', () => {
  const accounts = [
    account('Piraeus', 'CURRENT'),
    account('Alpha', 'SAVINGS'),
    account('Wallet', 'CASH'),
    account('Old', 'CURRENT', true),
    account('Edenred', 'MEAL_VOUCHER'),
  ]
  const names = (list: AccountSummary[]) => list.map(a => a.id)

  it('offers every other active account, cash first', () => {
    expect(names(transferAccounts(accounts, 'Piraeus', true))).toEqual(['Wallet', 'Alpha', 'Edenred'])
  })

  it('never takes money out of a meal-voucher account', () => {
    expect(names(transferAccounts(accounts, 'Piraeus', false))).toEqual(['Wallet', 'Alpha'])
    expect(transferAccounts(accounts, 'Edenred', true)).toEqual([])
    expect(names(transferAccounts(accounts, 'Edenred', false))).toEqual(['Wallet', 'Alpha', 'Piraeus'])
  })

  it('offers several rows only the accounts every one of them can use', () => {
    const rows = [{ accountId: 'Piraeus', amountCents: -100 }, { accountId: 'Alpha', amountCents: -200 }]
    expect(names(bulkTransferAccounts(accounts, rows))).toEqual(['Wallet', 'Edenred'])
    expect(names(bulkTransferAccounts(accounts, [{ accountId: 'Piraeus', amountCents: 100 }]))).toEqual(['Wallet', 'Alpha'])
  })

  it('offers no transfer when money goes both ways, or out of a voucher card', () => {
    expect(bulkTransferAccounts(accounts, [{ accountId: 'Piraeus', amountCents: -100 }, { accountId: 'Piraeus', amountCents: 100 }])).toEqual([])
    expect(bulkTransferAccounts(accounts, [{ accountId: 'Piraeus', amountCents: -100 }, { accountId: 'Edenred', amountCents: -100 }])).toEqual([])
    expect(bulkTransferAccounts(accounts, [])).toEqual([])
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

  it('should name an imported row without a payee after the merchant in its bank text', () => {
    const imported = { ...row, payee: null, description: 'POS ΒΑΣΙΛΟΠΟΥΛΟΣ ΚΗΦΙΣΙΑ 4411', importBatchId: 'b1' }
    expect(draftFromRow(imported).payee).toBe('ΒΑΣΙΛΟΠΟΥΛΟΣ ΚΗΦΙΣΙΑ')
    expect(draftFromRow({ ...imported, payee: 'Βασιλόπουλος' }).payee).toBe('Βασιλόπουλος')
    expect(draftFromRow({ ...imported, transferId: 't', transferAccountId: 'cash' }).payee).toBe('')
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
  const base = { name: ' Alpha ', kind: 'CREDIT_CARD' as const, institutionId: 'inst_alpha', openingBalance: '-350,00', openingDate: '2026-10-01', holderMemberId: null, cards: [] }

  it('should keep a negative card balance and treat an empty balance as zero', () => {
    expect(parseAccountDraft(base)).toEqual({
      input: { name: 'Alpha', kind: 'CREDIT_CARD', institutionId: 'inst_alpha', openingBalanceCents: -35000, openingDate: '2026-10-01', holderMemberId: null, cards: [] },
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

  it('should ask whose a meal-voucher card is when parents exist', () => {
    const voucher = { ...base, kind: 'MEAL_VOUCHER' as const, institutionId: 'inst_up_hellas', openingBalance: '120,00' }
    expect(parseAccountDraft(voucher, true)).toEqual({ errors: { holder: 'holder_required' } })
    expect(parseAccountDraft({ ...voucher, holderMemberId: 'm1' }, true)).toMatchObject({ input: { institutionId: 'inst_up_hellas' } })
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

describe('ruleMerchants', () => {
  const imported = (description: string, accountId = 'a1') => ({ description, accountId, importBatchId: 'b1' })

  it('offers each imported merchant once, in order', () => {
    const rows = [imported('POS ΒΑΣΙΛΟΠΟΥΛΟΣ 4411'), imported('ΣΚΛΑΒΕΝΙΤΗΣ 12'), imported('POS ΒΑΣΙΛΟΠΟΥΛΟΣ 9876')]
    expect(ruleMerchants(rows, [], 'food')).toEqual(['ΒΑΣΙΛΟΠΟΥΛΟΣ', 'ΣΚΛΑΒΕΝΙΤΗΣ'])
  })

  it('skips rows typed in by hand and rows without bank text', () => {
    const rows = [{ description: 'ΒΑΣΙΛΟΠΟΥΛΟΣ', accountId: 'a1', importBatchId: null }, imported('1234')]
    expect(ruleMerchants(rows, [], 'food')).toEqual([])
  })

  it('skips a merchant a rule already puts in that category, but not in another one', () => {
    const rule = { pattern: 'vasilopoulos', match: 'CONTAINS' as const, accountId: null, categoryId: 'food' }
    const rows = [imported('POS ΒΑΣΙΛΟΠΟΥΛΟΣ 4411')]
    expect(ruleMerchants(rows, [rule], 'food')).toEqual([])
    expect(ruleMerchants(rows, [rule], 'home')).toEqual(['ΒΑΣΙΛΟΠΟΥΛΟΣ'])
    expect(ruleMerchants(rows, [{ ...rule, accountId: 'a2' }], 'food')).toEqual(['ΒΑΣΙΛΟΠΟΥΛΟΣ'])
  })
})
