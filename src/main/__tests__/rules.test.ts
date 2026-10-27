import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts } from '../services/accounts'
import { createTransaction } from '../services/transactions'
import { seedDefaults } from '../services/seed'
import { createRule, deleteRule, listRules, updateRule } from '../services/rules'

async function setup() {
  await seedDefaults('el')
  const [bankId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institution: 'ALPHA', openingBalanceCents: 0, openingDate: '2026-09-30' },
  ])
  const category = (name: string) => prisma.category.findFirstOrThrow({ where: { name } })
  return { bankId, groceries: await category('Σούπερ μάρκετ'), eatingOut: await category('Φαγητό έξω') }
}

/** An imported-looking row with bank text and no category */
async function waiting(accountId: string, description: string) {
  return (await prisma.transaction.create({
    data: { accountId, bookedAt: new Date('2026-10-02T12:00:00Z'), amountCents: -1000, description },
  })).id
}

beforeEach(() => resetTestDb())

describe('category rules', () => {
  it('should store the pattern folded, so Greek and Latin spellings are one rule', async () => {
    const { groceries } = await setup()
    const { id } = await createRule({ pattern: 'ΚΡΗΤΙΚΟΣ', categoryId: groceries.id })
    const again = await createRule({ pattern: 'kritikos', categoryId: groceries.id, payee: 'Κρητικός' })
    expect(again.id).toBe(id)
    const rule = (await listRules()).find(r => r.id === id)
    expect(rule).toMatchObject({ pattern: 'kritikos', payee: 'Κρητικός', categoryName: 'Σούπερ μάρκετ' })
    // Learned rules come before the seeded merchants
    expect((await listRules())[0].id).toBe(id)
  })

  it('should sort the rows still waiting for a category, and leave sorted rows alone', async () => {
    const { bankId, groceries, eatingOut } = await setup()
    const a = await waiting(bankId, 'POS ΚΡΗΤΙΚΟΣ 4411')
    const b = await waiting(bankId, 'ΚΡΗΤΙΚΟΣ ΚΗΦΙΣΙΑ')
    const other = await waiting(bankId, 'ΚΡΗΤΙΚΟΣΑΚΗΣ')
    const sorted = await createTransaction({ kind: 'EXPENSE', accountId: bankId, amountCents: 500, bookedAt: '2026-10-01', categoryId: eatingOut.id, payee: 'Κρητικός' })

    const { appliedCount } = await createRule({ pattern: 'ΚΡΗΤΙΚΟΣ', categoryId: groceries.id, payee: 'Κρητικός', applyToUncategorised: true })
    expect(appliedCount).toBe(2)
    const rows = await prisma.transaction.findMany({ where: { id: { in: [a, b, other, sorted] } } })
    const byId = new Map(rows.map(r => [r.id, r]))
    expect(byId.get(a)).toMatchObject({ categoryId: groceries.id, payee: 'Κρητικός' })
    expect(byId.get(b)?.categoryId).toBe(groceries.id)
    expect(byId.get(other)?.categoryId).toBeNull()
    expect(byId.get(sorted)?.categoryId).toBe(eatingOut.id)
  })

  it('should refuse a group, an empty pattern and unknown rules', async () => {
    const { groceries } = await setup()
    await expect(createRule({ pattern: 'x', categoryId: groceries.parentId })).rejects.toThrow('CATEGORY_NOT_FOUND')
    await expect(createRule({ pattern: '  ', categoryId: groceries.id })).rejects.toThrow('INVALID_INPUT')
    await expect(updateRule('nope', { payee: 'x' })).rejects.toThrow('RULE_NOT_FOUND')
    await expect(deleteRule('nope')).rejects.toThrow('RULE_NOT_FOUND')
  })

  it('should change and delete a rule', async () => {
    const { groceries, eatingOut } = await setup()
    const { id } = await createRule({ pattern: 'kritikos', categoryId: groceries.id })
    await updateRule(id, { categoryId: eatingOut.id, pattern: 'ΚΡΗΤΙΚΟΣ ΚΑΦΕ' })
    expect((await listRules()).find(r => r.id === id)).toMatchObject({ pattern: 'kritikos kafe', categoryId: eatingOut.id })
    await deleteRule(id)
    expect((await listRules()).some(r => r.id === id)).toBe(false)
  })
})
