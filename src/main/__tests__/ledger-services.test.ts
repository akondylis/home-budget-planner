import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { archiveAccount, createAccount, createAccounts, listAccounts, updateAccount } from '../services/accounts'
import { archiveCategory, createCategory, listCategories, updateCategory } from '../services/categories'
import { SEED_GROUPS, SEED_RULES, seedDefaults } from '../services/seed'
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  linkTransfer,
  listPayeeSuggestions,
  listTransactions,
  setCategory,
  updateTransaction,
  updateTransfer,
} from '../services/transactions'
import type { AccountInput } from '../../shared/ledger'

const bank: AccountInput = { name: 'Alpha', kind: 'CURRENT', institution: 'ALPHA', openingBalanceCents: 100_000, openingDate: '2026-10-01' }
const cash: AccountInput = { name: 'Μετρητά', kind: 'CASH', institution: 'OTHER', openingBalanceCents: 5_000, openingDate: '2026-10-01' }

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
    expect(tree.map(g => g.type)).toEqual(['INCOME', 'BILL', 'SUBSCRIPTION', 'EXPENSE', 'DEBT', 'SAVINGS'])
    expect(tree.flatMap(g => g.children).length).toBe(SEED_GROUPS.flatMap(g => g.categories).length)
    const rules = await prisma.categoryRule.findMany({ include: { category: true }, orderBy: { priority: 'desc' } })
    expect(rules).toHaveLength(SEED_RULES.length)
    expect(rules[0]).toMatchObject({ pattern: 'dei', match: 'STARTS_WITH', category: { name: 'Electricity' } })
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
})
