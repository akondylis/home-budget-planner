import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts } from '../services/accounts'
import { createTransaction } from '../services/transactions'
import { seedDefaults } from '../services/seed'
import { createRule } from '../services/rules'
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  listCategoriesForManage,
  mergeCategory,
  moveCategory,
  reorderCategories,
  updateCategory,
} from '../services/categories'

async function setup() {
  await seedDefaults('el')
  const [bankId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institutionId: 'inst_alpha', openingBalanceCents: 0, openingDate: '2026-09-30' },
  ])
  const category = (name: string) => prisma.category.findFirstOrThrow({ where: { name } })
  return {
    bankId,
    groceries: await category('Σούπερ μάρκετ'),
    eatingOut: await category('Φαγητό έξω'),
    spending: await category('Έξοδα'),
    bills: await category('Λογαριασμοί'),
  }
}

const spend = (accountId: string, categoryId: string) =>
  createTransaction({ kind: 'EXPENSE', accountId, amountCents: 1000, bookedAt: '2026-10-01', categoryId })

beforeEach(() => resetTestDb())

describe('category management', () => {
  it('should list archived categories with their row and rule counts', async () => {
    const { bankId, groceries, eatingOut } = await setup()
    await spend(bankId, groceries.id)
    await spend(bankId, groceries.id)
    await createRule({ pattern: 'KRITIKOS', categoryId: groceries.id })
    await archiveCategory(eatingOut.id)

    const children = (await listCategoriesForManage()).flatMap(g => g.children)
    const seededRules = await prisma.categoryRule.count({ where: { categoryId: groceries.id } })
    expect(children.find(c => c.id === groceries.id)).toMatchObject({ transactionCount: 2, ruleCount: seededRules, archived: false })
    expect(children.find(c => c.id === eatingOut.id)?.archived).toBe(true)
  })

  it('should move a category into another group and give it that group\'s type', async () => {
    const { eatingOut, bills } = await setup()
    await moveCategory(eatingOut.id, bills.id)
    const moved = await prisma.category.findUniqueOrThrow({ where: { id: eatingOut.id } })
    expect(moved).toMatchObject({ parentId: bills.id, type: 'BILL' })
  })

  it('should refuse a move onto a name the group already has, and moving a group', async () => {
    const { eatingOut, bills, spending } = await setup()
    await createCategory({ name: 'Φαγητό έξω', parentId: bills.id })
    await expect(moveCategory(eatingOut.id, bills.id)).rejects.toThrow('CATEGORY_EXISTS')
    await expect(moveCategory(spending.id, bills.id)).rejects.toThrow('INVALID_INPUT')
  })

  it('should take a name over from an archived category nothing uses', async () => {
    const { eatingOut, bills } = await setup()
    const twin = await createCategory({ name: 'Φαγητό έξω', parentId: bills.id })
    await archiveCategory(twin)
    await moveCategory(eatingOut.id, bills.id)
    expect(await prisma.category.findUnique({ where: { id: twin } })).toBeNull()
  })

  it('should save a new order for a group\'s categories', async () => {
    const { spending } = await setup()
    const ids = (await prisma.category.findMany({ where: { parentId: spending.id }, orderBy: { sortOrder: 'asc' } })).map(c => c.id)
    const reversed = [...ids].reverse()
    await reorderCategories(spending.id, reversed)
    const after = (await prisma.category.findMany({ where: { parentId: spending.id }, orderBy: { sortOrder: 'asc' } })).map(c => c.id)
    expect(after).toEqual(reversed)
    await expect(reorderCategories(spending.id, [ids[0], ids[0]])).rejects.toThrow('INVALID_INPUT')
  })

  it('should merge rows and rules into the target, drop a duplicate rule and archive the source', async () => {
    const { bankId, groceries, eatingOut } = await setup()
    await spend(bankId, eatingOut.id)
    await spend(bankId, eatingOut.id)
    await createRule({ pattern: 'SOUVLAKI', categoryId: eatingOut.id })
    await createRule({ pattern: 'KRITIKOS', categoryId: groceries.id, match: 'EXACT' })
    // createRule() reuses a rule with the same pattern, so the twin is written directly
    await prisma.categoryRule.create({ data: { pattern: 'kritikos', match: 'EXACT', categoryId: eatingOut.id } })
    const sourceRules = await prisma.categoryRule.count({ where: { categoryId: eatingOut.id } })

    const result = await mergeCategory(eatingOut.id, groceries.id)
    expect(result).toEqual({ transactions: 2, rules: sourceRules - 1 })
    expect(await prisma.transaction.count({ where: { categoryId: groceries.id } })).toBe(2)
    expect(await prisma.categoryRule.count({ where: { pattern: 'kritikos', match: 'EXACT' } })).toBe(1)
    expect(await prisma.categoryRule.count({ where: { categoryId: eatingOut.id } })).toBe(0)
    expect((await prisma.category.findUniqueOrThrow({ where: { id: eatingOut.id } })).archivedAt).not.toBeNull()
  })

  it('should refuse to merge a category into itself or into a group', async () => {
    const { groceries, spending } = await setup()
    await expect(mergeCategory(groceries.id, groceries.id)).rejects.toThrow('INVALID_INPUT')
    await expect(mergeCategory(groceries.id, spending.id)).rejects.toThrow('INVALID_INPUT')
  })

  it('should restore a category together with its archived group', async () => {
    const { spending, groceries } = await setup()
    await archiveCategory(spending.id)
    await archiveCategory(groceries.id, false)
    const [group, child] = await Promise.all([
      prisma.category.findUniqueOrThrow({ where: { id: spending.id } }),
      prisma.category.findUniqueOrThrow({ where: { id: groceries.id } }),
    ])
    expect(group.archivedAt).toBeNull()
    expect(child.archivedAt).toBeNull()
  })

  it('should bring back the categories archived with a group, but not one archived before', async () => {
    const { spending, groceries, eatingOut } = await setup()
    await archiveCategory(eatingOut.id)
    await new Promise(r => setTimeout(r, 5))
    await archiveCategory(spending.id)
    await archiveCategory(spending.id, false)
    expect((await prisma.category.findUniqueOrThrow({ where: { id: groceries.id } })).archivedAt).toBeNull()
    expect((await prisma.category.findUniqueOrThrow({ where: { id: eatingOut.id } })).archivedAt).not.toBeNull()
  })

  it('should refuse a rename onto an archived name that still holds rows', async () => {
    const { bankId, eatingOut, spending } = await setup()
    await spend(bankId, eatingOut.id)
    await archiveCategory(eatingOut.id)
    const other = await createCategory({ name: 'Καφέδες', parentId: spending.id })
    await expect(updateCategory(other, { name: 'Φαγητό έξω' })).rejects.toThrow('CATEGORY_EXISTS')
  })

  it('should delete an unused category with its rules, and refuse one with rows', async () => {
    const { bankId, groceries, eatingOut } = await setup()
    await createRule({ pattern: 'SOUVLAKI', categoryId: eatingOut.id })
    await deleteCategory(eatingOut.id)
    expect(await prisma.category.findUnique({ where: { id: eatingOut.id } })).toBeNull()
    expect(await prisma.categoryRule.count({ where: { pattern: 'souvlaki' } })).toBe(0)

    await spend(bankId, groceries.id)
    await expect(deleteCategory(groceries.id)).rejects.toThrow('CATEGORY_IN_USE')
  })

  it('should refuse to delete a group that still has categories', async () => {
    const { spending } = await setup()
    await expect(deleteCategory(spending.id)).rejects.toThrow('CATEGORY_IN_USE')
  })
})
