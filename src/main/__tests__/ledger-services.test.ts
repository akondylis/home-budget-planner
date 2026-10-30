import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { archiveAccount, createAccount, createAccounts, listAccounts, updateAccount } from '../services/accounts'
import { archiveMember, createMember, listMembers } from '../services/members'
import { archiveCategory, createCategory, listCategories, updateCategory } from '../services/categories'
import { SEED_GROUPS, SEED_RULES, seedDefaults } from '../services/seed'
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  linkTransfer,
  listPayeeSuggestions,
  listTransactions,
  makeTransfers,
  setCategory,
  setPayee,
  updateTransaction,
  updateTransfer,
} from '../services/transactions'
import type { AccountInput } from '../../shared/ledger'

const bank: AccountInput = { name: 'Alpha', kind: 'CURRENT', institutionId: 'inst_alpha', openingBalanceCents: 100_000, openingDate: '2026-10-01' }
const cash: AccountInput = { name: 'Μετρητά', kind: 'CASH', institutionId: null, openingBalanceCents: 5_000, openingDate: '2026-10-01' }

async function setup() {
  const [bankId, cashId] = await createAccounts([bank, cash])
  const groupId = await createCategory({ name: 'Έξοδα', type: 'EXPENSE' })
  const groceriesId = await createCategory({ name: 'Σούπερ μάρκετ', parentId: groupId })
  const incomeGroupId = await createCategory({ name: 'Έσοδα', type: 'INCOME' })
  const salaryId = await createCategory({ name: 'Μισθός', parentId: incomeGroupId })
  return { bankId, cashId, groupId, groceriesId, salaryId }
}

const balanceOf = async (id: string) => (await listAccounts()).find(a => a.id === id)!.balanceCents

beforeEach(() => resetTestDb())

describe('accounts', () => {
  it('should list accounts in creation order with opening balance as balance when there are no rows', async () => {
    await createAccounts([bank, cash])
    const list = await listAccounts()
    expect(list.map(a => [a.name, a.balanceCents, a.openingDate, a.importedUntil])).toEqual([
      ['Alpha', 100_000, '2026-10-01', null],
      ['Μετρητά', 5_000, '2026-10-01', null],
    ])
  })

  it('should throw INVALID_INPUT when the name is blank or the amount is not whole cents', async () => {
    await expect(createAccount({ ...bank, name: '  ' })).rejects.toThrow('INVALID_INPUT')
    await expect(createAccount({ ...bank, openingBalanceCents: 1.5 })).rejects.toThrow('INVALID_INPUT')
    await expect(createAccount({ ...bank, openingDate: '01/10/2026' })).rejects.toThrow('INVALID_INPUT')
  })

  it('should hide an archived account and keep its transactions', async () => {
    const { bankId, groceriesId } = await setup()
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 1000, bookedAt: '2026-10-02', categoryId: groceriesId })
    await archiveAccount(bankId)
    expect((await listAccounts()).map(a => a.name)).toEqual(['Μετρητά'])
    expect((await listAccounts({ includeArchived: true })).find(a => a.id === bankId)?.archived).toBe(true)
    expect(await prisma.transaction.count()).toBe(1)
  })

  it('should throw ACCOUNT_NOT_FOUND when updating a missing account', async () => {
    await expect(updateAccount('nope', bank)).rejects.toThrow('ACCOUNT_NOT_FOUND')
  })
})

describe('account holders and cards', () => {
  const card: AccountInput = { name: 'Alpha card', kind: 'CREDIT_CARD', institutionId: 'inst_alpha', openingBalanceCents: 0, openingDate: '2026-10-01' }

  it('should save a holder and cards, and list them in order with their holders', async () => {
    const andreas = await createMember({ name: 'Ανδρέας', colour: 'blue' })
    const maria = await createMember({ name: 'Μαρία', colour: 'purple' })
    const id = await createAccount({ ...card, holderMemberId: andreas, cards: [{ last4: '1234', holderMemberId: andreas }, { last4: '5678', holderMemberId: maria }] })
    const [listed] = await listAccounts()
    expect(listed).toMatchObject({ id, holderMemberId: andreas, holderName: 'Ανδρέας', holderColour: 'blue' })
    expect(listed.cards.map(c => [c.last4, c.holderName])).toEqual([['1234', 'Ανδρέας'], ['5678', 'Μαρία']])
    expect((await listMembers()).map(m => m.accountCount)).toEqual([1, 0])
  })

  it('should sync the card list on update: add, change, swap digits and remove', async () => {
    const id = await createAccount({ ...card, cards: [{ last4: '1111', holderMemberId: null }, { last4: '2222', holderMemberId: null }, { last4: '3333', holderMemberId: null }] })
    const [a, b] = (await listAccounts())[0].cards
    await updateAccount(id, { ...card, cards: [{ id: b.id, last4: '1111', holderMemberId: null }, { id: a.id, last4: '2222', holderMemberId: null }, { last4: '4444', holderMemberId: null }] })
    const cards = (await listAccounts())[0].cards
    expect(cards.map(c => [c.id, c.last4])).toEqual([[b.id, '1111'], [a.id, '2222'], [expect.any(String), '4444']])
    await updateAccount(id, { ...card, name: 'Renamed' })
    expect((await listAccounts())[0].cards).toHaveLength(3)
  })

  it('should refuse a repeated card, a card of another account and an unknown holder', async () => {
    const id = await createAccount(card)
    const other = await createAccount({ ...card, name: 'Other', cards: [{ last4: '9999', holderMemberId: null }] })
    const foreign = (await listAccounts()).find(a => a.id === other)!.cards[0].id
    await expect(updateAccount(id, { ...card, cards: [{ last4: '1234', holderMemberId: null }, { last4: '1234', holderMemberId: null }] })).rejects.toThrow('CARD_DUPLICATE')
    await expect(updateAccount(id, { ...card, cards: [{ id: foreign, last4: '9999', holderMemberId: null }] })).rejects.toThrow('CARD_NOT_FOUND')
    await expect(updateAccount(id, { ...card, holderMemberId: 'nope' })).rejects.toThrow('MEMBER_NOT_FOUND')
    await expect(createAccount({ ...card, cards: [{ last4: '12a4', holderMemberId: null }] })).rejects.toThrow('INVALID_INPUT')
    expect((await listAccounts()).find(a => a.id === other)!.cards).toHaveLength(1)
  })

  it('should keep an archived holder already stored, but not accept one newly', async () => {
    const andreas = await createMember({ name: 'Andreas', colour: 'blue' })
    const id = await createAccount({ ...card, holderMemberId: andreas, cards: [{ last4: '1234', holderMemberId: andreas }] })
    await archiveMember(andreas)
    const cardId = (await listAccounts())[0].cards[0].id
    await updateAccount(id, { ...card, name: 'Still Andreas', holderMemberId: andreas, cards: [{ id: cardId, last4: '1234', holderMemberId: andreas }] })
    expect((await listAccounts())[0]).toMatchObject({ name: 'Still Andreas', holderName: 'Andreas' })
    await expect(createAccount({ ...card, name: 'New', holderMemberId: andreas })).rejects.toThrow('MEMBER_NOT_FOUND')
  })

  it('should keep the cards of an archived account', async () => {
    const id = await createAccount({ ...card, cards: [{ last4: '1234', holderMemberId: null }] })
    await archiveAccount(id)
    expect((await listAccounts({ includeArchived: true }))[0].cards).toHaveLength(1)
  })
})

describe('categories', () => {
  it('should give a category the type of its group, and pass a group type change down', async () => {
    const { groupId, groceriesId } = await setup()
    expect((await prisma.category.findUnique({ where: { id: groceriesId } }))?.type).toBe('EXPENSE')
    await updateCategory(groupId, { name: 'Λογαριασμοί', type: 'BILL' })
    expect((await prisma.category.findUnique({ where: { id: groceriesId } }))?.type).toBe('BILL')
  })

  it('should list groups by type with income first', async () => {
    await setup()
    const tree = await listCategories()
    expect(tree.map(g => g.name)).toEqual(['Έσοδα', 'Έξοδα'])
    expect(tree[1].children.map(c => c.name)).toEqual(['Σούπερ μάρκετ'])
  })

  it('should throw CATEGORY_EXISTS for a duplicate name in the same group, including top-level groups', async () => {
    const { groupId } = await setup()
    await expect(createCategory({ name: 'Σούπερ μάρκετ', parentId: groupId })).rejects.toThrow('CATEGORY_EXISTS')
    await expect(createCategory({ name: 'Έξοδα', type: 'EXPENSE' })).rejects.toThrow('CATEGORY_EXISTS')
  })

  it('should archive a group with its categories and restore one when created again', async () => {
    const { groupId, groceriesId } = await setup()
    await archiveCategory(groupId)
    expect((await listCategories()).map(g => g.name)).toEqual(['Έσοδα'])
    const again = await createCategory({ name: 'Έξοδα', type: 'EXPENSE' })
    expect(again).toBe(groupId)
    expect(await prisma.category.findUnique({ where: { id: groceriesId } })).toMatchObject({ archivedAt: expect.any(Date) })
  })
})

describe('seed', () => {
  it('should write the starting categories and rules once, in the chosen language', async () => {
    expect(await seedDefaults('en')).toBe(true)
    expect(await seedDefaults('en')).toBe(false)
    const tree = await listCategories()
    expect(tree.map(g => g.type)).toEqual(SEED_GROUPS.map(g => g.type))
    expect(tree.filter(g => g.type === 'EXPENSE').map(g => g.name)).toEqual(['Food', 'Home', 'Transport', 'Health', 'Personal care', 'Leisure', 'Family & other'])
    expect(tree.flatMap(g => g.children).length).toBe(SEED_GROUPS.flatMap(g => g.categories).length)
    const rules = await prisma.categoryRule.findMany({ include: { category: true }, orderBy: { priority: 'desc' } })
    expect(rules).toHaveLength(SEED_RULES.length)
    expect(rules[0]).toMatchObject({ pattern: 'dei', match: 'STARTS_WITH', category: { name: 'Electricity' } })
  })

  it('should have unique keys and names and no empty group in the starter list', () => {
    const keys = SEED_GROUPS.flatMap(g => g.categories.map(c => c.key))
    expect(new Set(keys).size).toBe(keys.length)
    for (const lang of ['el', 'en'] as const) {
      const groupNames = SEED_GROUPS.map(g => g.name[lang])
      expect(new Set(groupNames).size).toBe(groupNames.length)
      for (const g of SEED_GROUPS) {
        expect(g.categories.length).toBeGreaterThan(0)
        const names = g.categories.map(c => c.name[lang])
        expect(new Set(names).size).toBe(names.length)
      }
    }
  })
})

describe('transactions', () => {
  it('should store an expense as negative and income as positive, from positive input', async () => {
    const { bankId, groceriesId, salaryId } = await setup()
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 4250, bookedAt: '2026-10-03', categoryId: groceriesId, payee: 'Lidl' })
    await createTransaction({ kind: 'INCOME', accountId: bankId, amountCents: 150_000, bookedAt: '2026-10-01', categoryId: salaryId })
    const page = await listTransactions({ month: '2026-10' })
    expect(page.rows.map(r => r.amountCents)).toEqual([-4250, 150_000])
    expect(page.rows[0]).toMatchObject({ payee: 'Lidl', description: 'Lidl', categoryName: 'Σούπερ μάρκετ', categoryGroupName: 'Έξοδα', categoryType: 'EXPENSE' })
    expect([page.incomeCents, page.expenseCents]).toEqual([150_000, -4250])
    expect(await balanceOf(bankId)).toBe(100_000 - 4250 + 150_000)
  })

  it('should reject zero amounts, missing categories and archived accounts', async () => {
    const { bankId, groceriesId } = await setup()
    const base = { kind: 'EXPENSE', accountId: bankId, amountCents: 100, bookedAt: '2026-10-03', categoryId: groceriesId }
    await expect(createTransaction({ ...base, amountCents: 0 })).rejects.toThrow('INVALID_AMOUNT')
    await expect(createTransaction({ ...base, categoryId: null })).rejects.toThrow('CATEGORY_REQUIRED')
    await expect(createTransaction({ ...base, categoryId: 'nope' })).rejects.toThrow('CATEGORY_NOT_FOUND')
    await archiveAccount(bankId)
    await expect(createTransaction(base)).rejects.toThrow('ACCOUNT_NOT_FOUND')
  })

  it('should include the last day of the month and exclude the next month when filtering by month', async () => {
    const { bankId, groceriesId } = await setup()
    for (const day of ['2026-09-30', '2026-10-31', '2026-11-01']) {
      await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 100, bookedAt: day, categoryId: groceriesId })
    }
    expect((await listTransactions({ month: '2026-10' })).rows.map(r => r.bookedAt)).toEqual(['2026-10-31'])
  })

  it('should find a group\'s rows when filtering by the group and by category type', async () => {
    const { bankId, groupId, groceriesId, salaryId } = await setup()
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 100, bookedAt: '2026-10-03', categoryId: groceriesId })
    await createTransaction({ kind: 'INCOME', accountId: bankId, amountCents: 100, bookedAt: '2026-10-03', categoryId: salaryId })
    expect((await listTransactions({ categoryId: groupId })).total).toBe(1)
    expect((await listTransactions({ categoryType: 'INCOME' })).total).toBe(1)
  })

  it('should paginate newest first', async () => {
    const { bankId, groceriesId } = await setup()
    for (let d = 1; d <= 5; d++) {
      await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: d, bookedAt: `2026-10-0${d}`, categoryId: groceriesId })
    }
    const page2 = await listTransactions({ page: 2, pageSize: 2 })
    expect(page2.total).toBe(5)
    expect(page2.rows.map(r => r.bookedAt)).toEqual(['2026-10-03', '2026-10-02'])
  })

  it('should update an expense and keep an imported row\'s bank text', async () => {
    const { bankId, groceriesId } = await setup()
    const batch = await prisma.importBatch.create({
      data: { accountId: bankId, fileName: 'a.csv', fileHash: 'h', dateFrom: new Date(), dateTo: new Date(), rowCount: 1, importedCount: 1, skippedCount: 0 },
    })
    const row = await prisma.transaction.create({
      data: { accountId: bankId, bookedAt: new Date('2026-10-05T12:00:00Z'), amountCents: -999, description: 'POS ΣΚΛΑΒΕΝΙΤΗΣ 1234', importBatchId: batch.id, fingerprint: 'f1' },
    })
    await updateTransaction(row.id, { kind: 'EXPENSE', accountId: bankId, amountCents: 999, bookedAt: '2026-10-05', categoryId: groceriesId, payee: 'Σκλαβενίτης' })
    expect(await prisma.transaction.findUnique({ where: { id: row.id } })).toMatchObject({
      description: 'POS ΣΚΛΑΒΕΝΙΤΗΣ 1234', payee: 'Σκλαβενίτης', fingerprint: 'f1', categoryId: groceriesId,
    })
  })

  it('should count rows to categorise and set a category on several at once, skipping transfers', async () => {
    const { bankId, cashId, groceriesId } = await setup()
    const a = await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date('2026-10-05T12:00:00Z'), amountCents: -100 } })
    const b = await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date('2026-10-06T12:00:00Z'), amountCents: -200 } })
    await createTransfer({ fromAccountId: bankId, toAccountId: cashId, amountCents: 5000, bookedAt: '2026-10-07' })
    const all = await listTransactions({})
    expect(all.uncategorisedCount).toBe(2)
    expect((await listTransactions({ uncategorised: true })).rows.map(r => r.id).sort()).toEqual([a.id, b.id].sort())
    const transferRowId = all.rows.find(r => r.transferId)!.id
    expect(await setCategory([a.id, b.id, transferRowId], groceriesId)).toBe(2)
    expect((await listTransactions({})).uncategorisedCount).toBe(0)
  })

  it('should set one payee on several rows: bank text kept on imported ones, transfers skipped, empty clears', async () => {
    const { bankId, cashId } = await setup()
    const batch = await prisma.importBatch.create({
      data: { accountId: bankId, fileName: 'a.csv', fileHash: 'h', dateFrom: new Date(), dateTo: new Date(), rowCount: 1, importedCount: 1, skippedCount: 0 },
    })
    const imported = await prisma.transaction.create({
      data: { accountId: bankId, bookedAt: new Date('2026-10-05T12:00:00Z'), amountCents: -999, description: 'POS ΣΚΛΑΒΕΝΙΤΗΣ 1234', importBatchId: batch.id, fingerprint: 'f1' },
    })
    const { id: manualId } = await prisma.transaction.create({ data: { accountId: cashId, bookedAt: new Date('2026-10-06T12:00:00Z'), amountCents: -500, payee: 'skl', description: 'skl' } })
    await createTransfer({ fromAccountId: bankId, toAccountId: cashId, amountCents: 5000, bookedAt: '2026-10-07' })
    const transferRowId = (await listTransactions({})).rows.find(r => r.transferId)!.id

    expect(await setPayee([imported.id, manualId, transferRowId], '  Σκλαβενίτης ')).toBe(2)
    const byId = async (id: string) => prisma.transaction.findUnique({ where: { id }, select: { payee: true, description: true } })
    expect(await byId(imported.id)).toEqual({ payee: 'Σκλαβενίτης', description: 'POS ΣΚΛΑΒΕΝΙΤΗΣ 1234' })
    expect(await byId(manualId)).toEqual({ payee: 'Σκλαβενίτης', description: 'Σκλαβενίτης' })
    expect((await byId(transferRowId))?.payee).toBeNull()

    expect(await setPayee([imported.id], '')).toBe(1)
    expect(await byId(imported.id)).toEqual({ payee: null, description: 'POS ΣΚΛΑΒΕΝΙΤΗΣ 1234' })
    await expect(setPayee([imported.id], 42)).rejects.toThrow('INVALID_INPUT')
    await expect(setPayee('nope', 'x')).rejects.toThrow('INVALID_INPUT')
  })

  it('should search across pages with totals that follow the search', async () => {
    const { bankId, cashId, groceriesId, salaryId } = await setup()
    await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date('2026-10-03T12:00:00Z'), amountCents: -4200, description: 'POS ΣΚΛΑΒΕΝΙΤΗΣ 1234', categoryId: groceriesId } })
    await createTransaction({ kind: 'EXPENSE', accountId: cashId, amountCents: 1250, bookedAt: '2026-10-04', categoryId: groceriesId, payee: 'Σκλαβενίτης' })
    await createTransaction({ kind: 'INCOME', accountId: bankId, amountCents: 200000, bookedAt: '2026-10-01', categoryId: salaryId, payee: 'Acme' })
    await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date('2026-10-05T12:00:00Z'), amountCents: -999, description: 'ΣΚΛΑΒΕΝΙΤΗΣ ΚΗΦΙΣΙΑ' } })

    const found = await listTransactions({ query: 'σκλαβενιτης', pageSize: 2 })
    expect(found.total).toBe(3)
    expect(found.rows.map(r => r.bookedAt)).toEqual(['2026-10-05', '2026-10-04'])
    expect([found.incomeCents, found.expenseCents, found.uncategorisedCount]).toEqual([0, -6449, 1])
    expect((await listTransactions({ query: 'σκλαβενιτης', page: 2, pageSize: 2 })).rows.map(r => r.bookedAt)).toEqual(['2026-10-03'])
    expect((await listTransactions({ query: 'σκλαβενιτης', uncategorised: true })).total).toBe(1)
    expect((await listTransactions({ query: '12,50' })).rows.map(r => r.payee)).toEqual(['Σκλαβενίτης'])
    expect((await listTransactions({ query: 'nothing like it' })).total).toBe(0)
  })

  it('should sort by amount in SQL and by name or category in memory, across pages', async () => {
    const { bankId, groceriesId, salaryId } = await setup()
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 5000, bookedAt: '2026-10-01', categoryId: groceriesId, payee: 'Lidl' })
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 1000, bookedAt: '2026-10-02', categoryId: groceriesId, payee: 'ab' })
    await createTransaction({ kind: 'INCOME', accountId: bankId, amountCents: 200000, bookedAt: '2026-10-03', categoryId: salaryId, payee: 'Acme' })
    await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date('2026-10-04T12:00:00Z'), amountCents: -300, description: 'Bakery' } })

    const names = async (sort: 'amount' | 'description' | 'category', direction: 'asc' | 'desc', page = 1) =>
      (await listTransactions({ sort, direction, page, pageSize: 2 })).rows.map(r => r.payee ?? r.description)
    expect(await names('amount', 'asc')).toEqual(['Lidl', 'ab'])
    expect(await names('amount', 'desc')).toEqual(['Acme', 'Bakery'])
    expect([...await names('description', 'asc'), ...await names('description', 'asc', 2)]).toEqual(['ab', 'Acme', 'Bakery', 'Lidl'])
    expect([...await names('category', 'asc'), ...await names('category', 'asc', 2)]).toEqual(['Acme', 'ab', 'Lidl', 'Bakery'])
    expect((await listTransactions({ sort: 'description' })).total).toBe(4)
  })

  it('should suggest past payees with their latest category', async () => {
    const { bankId, cashId, groceriesId, salaryId } = await setup()
    await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 100, bookedAt: '2026-10-01', categoryId: salaryId, payee: 'Lidl' })
    await createTransaction({ kind: 'EXPENSE', accountId: cashId, amountCents: 100, bookedAt: '2026-10-02', categoryId: groceriesId, payee: 'lidl' })
    expect(await listPayeeSuggestions()).toEqual([{ payee: 'lidl', categoryId: groceriesId, accountId: cashId, memberId: null }])
  })
})

describe('transfers', () => {
  it('should write two linked rows that move the balance but never count as income or expense', async () => {
    const { bankId, cashId } = await setup()
    const transferId = await createTransfer({ fromAccountId: bankId, toAccountId: cashId, amountCents: 20_000, bookedAt: '2026-10-04' })
    const page = await listTransactions({ month: '2026-10' })
    expect(page.rows).toHaveLength(2)
    expect(page.rows.every(r => r.transferId === transferId)).toBe(true)
    expect(page.rows.find(r => r.accountId === bankId)).toMatchObject({ amountCents: -20_000, transferAccountName: 'Μετρητά' })
    expect([page.incomeCents, page.expenseCents, page.uncategorisedCount]).toEqual([0, 0, 0])
    expect(await balanceOf(bankId)).toBe(80_000)
    expect(await balanceOf(cashId)).toBe(25_000)
  })

  it('should name the other account when only one side is on the page', async () => {
    const { bankId, cashId } = await setup()
    await createTransfer({ fromAccountId: bankId, toAccountId: cashId, amountCents: 100, bookedAt: '2026-10-04' })
    const page = await listTransactions({ accountId: cashId })
    expect(page.rows[0]).toMatchObject({ amountCents: 100, transferAccountId: bankId, transferAccountName: 'Alpha' })
  })

  it('should throw SAME_ACCOUNT when both sides are one account', async () => {
    const { bankId } = await setup()
    await expect(createTransfer({ fromAccountId: bankId, toAccountId: bankId, amountCents: 1, bookedAt: '2026-10-04' })).rejects.toThrow('SAME_ACCOUNT')
  })

  it('should rewrite both sides when a transfer is edited', async () => {
    const { bankId, cashId } = await setup()
    const transferId = await createTransfer({ fromAccountId: bankId, toAccountId: cashId, amountCents: 100, bookedAt: '2026-10-04' })
    await updateTransfer(transferId, { fromAccountId: cashId, toAccountId: bankId, amountCents: 300, bookedAt: '2026-10-05', note: 'back' })
    expect(await balanceOf(cashId)).toBe(5_000 - 300)
    expect(await balanceOf(bankId)).toBe(100_000 + 300)
  })

  it('should refuse to edit a transfer row as an expense', async () => {
    const { bankId, cashId, groceriesId } = await setup()
    await createTransfer({ fromAccountId: bankId, toAccountId: cashId, amountCents: 100, bookedAt: '2026-10-04' })
    const row = (await listTransactions({ accountId: bankId })).rows[0]
    await expect(updateTransaction(row.id, { kind: 'EXPENSE', accountId: bankId, amountCents: 100, bookedAt: '2026-10-04', categoryId: groceriesId }))
      .rejects.toThrow('TRANSACTION_IS_TRANSFER')
  })

  it('should link two opposite rows in different accounts and clear their categories', async () => {
    const { bankId, cashId, groceriesId } = await setup()
    const out = await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date(), amountCents: -300, categoryId: groceriesId } })
    const into = await prisma.transaction.create({ data: { accountId: cashId, bookedAt: new Date(), amountCents: 300 } })
    const other = await prisma.transaction.create({ data: { accountId: cashId, bookedAt: new Date(), amountCents: 299 } })
    await expect(linkTransfer(out.id, other.id)).rejects.toThrow('TRANSFER_MISMATCH')
    const transferId = await linkTransfer(out.id, into.id)
    expect(await prisma.transaction.findMany({ where: { transferId } })).toHaveLength(2)
    expect((await prisma.transaction.findUnique({ where: { id: out.id } }))?.categoryId).toBeNull()
    await expect(linkTransfer(out.id, into.id)).rejects.toThrow('TRANSFER_MISMATCH')
  })

  it('should delete both hand-entered sides, but keep an imported side as a plain row', async () => {
    const { bankId, cashId } = await setup()
    await createTransfer({ fromAccountId: bankId, toAccountId: cashId, amountCents: 100, bookedAt: '2026-10-04' })
    await deleteTransaction((await listTransactions({ accountId: cashId })).rows[0].id)
    expect(await prisma.transaction.count()).toBe(0)

    const batch = await prisma.importBatch.create({
      data: { accountId: bankId, fileName: 'a.csv', fileHash: 'h', dateFrom: new Date(), dateTo: new Date(), rowCount: 1, importedCount: 1, skippedCount: 0 },
    })
    const imported = await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date(), amountCents: -500, importBatchId: batch.id } })
    const hand = await prisma.transaction.create({ data: { accountId: cashId, bookedAt: new Date(), amountCents: 500 } })
    await linkTransfer(imported.id, hand.id)
    await deleteTransaction(hand.id)
    expect(await prisma.transaction.findUnique({ where: { id: imported.id } })).toMatchObject({ transferId: null })
  })

  it('should turn a saved row into a transfer, writing the other side in the import it came from', async () => {
    const { bankId, cashId, groceriesId } = await setup()
    const parent = await createMember({ name: 'Ανδρέας', colour: 'blue' })
    const batch = await prisma.importBatch.create({
      data: { accountId: bankId, fileName: 'a.csv', fileHash: 'h', dateFrom: new Date(), dateTo: new Date(), rowCount: 1, importedCount: 1, skippedCount: 0 },
    })
    const row = await prisma.transaction.create({
      data: { accountId: bankId, bookedAt: new Date('2026-10-05T12:00:00Z'), amountCents: -20_000, description: 'ATM 1234', categoryId: groceriesId, memberId: parent, importBatchId: batch.id },
    })
    const [transferId] = await makeTransfers([row.id], cashId)
    expect(await prisma.transaction.findUnique({ where: { id: row.id } })).toMatchObject({ transferId, categoryId: null, memberId: null })
    expect(await prisma.transaction.findFirst({ where: { accountId: cashId } })).toMatchObject({
      transferId, amountCents: 20_000, description: 'ATM 1234', importBatchId: batch.id, bookedAt: row.bookedAt,
    })
    const page = await listTransactions({ month: '2026-10' })
    expect([page.incomeCents, page.expenseCents, page.uncategorisedCount]).toEqual([0, 0, 0])
    expect(await balanceOf(cashId)).toBe(25_000)
    await expect(makeTransfers([row.id], cashId)).rejects.toThrow('TRANSFER_MISMATCH')
  })

  it('should refuse a transfer to the same, a missing or an archived account', async () => {
    const { bankId, cashId } = await setup()
    const row = await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date(), amountCents: -100 } })
    await expect(makeTransfers([row.id], bankId)).rejects.toThrow('SAME_ACCOUNT')
    await expect(makeTransfers([row.id], 'nope')).rejects.toThrow('ACCOUNT_NOT_FOUND')
    await expect(makeTransfers(['nope'], cashId)).rejects.toThrow('TRANSACTION_NOT_FOUND')
    await archiveAccount(cashId)
    await expect(makeTransfers([row.id], cashId)).rejects.toThrow('ACCOUNT_NOT_FOUND')
  })

  it('should turn several rows into transfers at once', async () => {
    const { bankId, cashId } = await setup()
    const a = await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date('2026-10-05T12:00:00Z'), amountCents: -2_000, description: 'ATM 1' } })
    const b = await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date('2026-10-06T12:00:00Z'), amountCents: -3_000, description: 'ATM 2' } })
    const transferIds = await makeTransfers([a.id, b.id], cashId)
    expect(new Set(transferIds).size).toBe(2)
    expect(await prisma.transaction.count({ where: { accountId: cashId, transferId: { in: transferIds } } })).toBe(2)
    expect(await balanceOf(cashId)).toBe(10_000)
    const page = await listTransactions({ month: '2026-10' })
    expect([page.incomeCents, page.expenseCents]).toEqual([0, 0])
  })

  it('should write nothing when one of several rows cannot become a transfer', async () => {
    const { bankId, cashId } = await setup()
    const ok = await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date(), amountCents: -2_000 } })
    const own = await prisma.transaction.create({ data: { accountId: cashId, bookedAt: new Date(), amountCents: -500 } })
    await expect(makeTransfers([ok.id, own.id], cashId)).rejects.toThrow('SAME_ACCOUNT')
    await expect(makeTransfers([], cashId)).rejects.toThrow('INVALID_INPUT')
    expect(await prisma.transaction.count({ where: { transferId: { not: null } } })).toBe(0)
  })
})

describe('meal-voucher cards', () => {
  const voucher: AccountInput = { name: 'Edenred', kind: 'MEAL_VOUCHER', institutionId: 'inst_edenred', openingBalanceCents: 12_000, openingDate: '2026-10-01' }
  const voucherCategories = () => prisma.category.findMany({ where: { type: 'INCOME', name: { in: ['Κουπόνια σίτισης', 'Meal vouchers'] } } })

  it('should accept only a voucher issuer, and need a holder once parents exist', async () => {
    await expect(createAccount({ ...voucher, institutionId: 'inst_alpha' })).rejects.toThrow('INVALID_INPUT')
    expect(await createAccount(voucher)).toBeTruthy()
    const parent = await createMember({ name: 'Ανδρέας', colour: 'blue' })
    await expect(createAccount({ ...voucher, name: 'Up' })).rejects.toThrow('HOLDER_REQUIRED')
    await expect(createAccounts([{ ...voucher, name: 'Up' }])).rejects.toThrow('HOLDER_REQUIRED')
    expect(await createAccount({ ...voucher, name: 'Up', institutionId: 'inst_up_hellas', holderMemberId: parent })).toBeTruthy()
  })

  it('should add the top-up income category with the first card, once, under the income group', async () => {
    const { salaryId } = await setup()
    await createAccount(voucher)
    await createAccounts([{ ...voucher, name: 'Up', institutionId: 'inst_up_hellas' }])
    const [category, ...rest] = await voucherCategories()
    expect(rest).toEqual([])
    const salary = await prisma.category.findUniqueOrThrow({ where: { id: salaryId } })
    expect(category).toMatchObject({ parentId: salary.parentId, archivedAt: null })
  })

  it('should bring back an archived top-up category instead of adding another', async () => {
    await seedDefaults('el')
    const [seeded] = await voucherCategories()
    await prisma.category.update({ where: { id: seeded.id }, data: { archivedAt: new Date() } })
    await createAccount(voucher)
    expect(await voucherCategories()).toEqual([expect.objectContaining({ id: seeded.id, archivedAt: null })])
  })

  it('should never send money out of a card, but take a transfer in', async () => {
    const { bankId } = await setup()
    const cardId = await createAccount(voucher)
    const move = { amountCents: 500, bookedAt: '2026-10-05' }
    await expect(createTransfer({ ...move, fromAccountId: cardId, toAccountId: bankId })).rejects.toThrow('VOUCHER_NO_TRANSFER_OUT')
    const transferId = await createTransfer({ ...move, fromAccountId: bankId, toAccountId: cardId })
    await expect(updateTransfer(transferId, { ...move, fromAccountId: cardId, toAccountId: bankId })).rejects.toThrow('VOUCHER_NO_TRANSFER_OUT')
    const out = await prisma.transaction.create({ data: { accountId: cardId, bookedAt: new Date(), amountCents: -300 } })
    const into = await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date(), amountCents: 300 } })
    await expect(linkTransfer(out.id, into.id)).rejects.toThrow('VOUCHER_NO_TRANSFER_OUT')
    await expect(makeTransfers([out.id], bankId)).rejects.toThrow('VOUCHER_NO_TRANSFER_OUT')
    // Money coming into the bank from the card would leave the card
    await expect(makeTransfers([into.id], cardId)).rejects.toThrow('VOUCHER_NO_TRANSFER_OUT')
    const spent = await prisma.transaction.create({ data: { accountId: bankId, bookedAt: new Date(), amountCents: -400 } })
    expect(await makeTransfers([spent.id], cardId)).toBeTruthy()
  })
})
