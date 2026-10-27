import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts } from '../services/accounts'
import { createCategory } from '../services/categories'
import { archiveMember, createMember, listMembers, updateMember } from '../services/members'
import {
  createTransaction,
  createTransfer,
  listPayeeSuggestions,
  listTransactions,
  setMember,
  updateTransaction,
} from '../services/transactions'
import { nextFreeColour } from '../../shared/members'

async function setup() {
  const [bankId, cashId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institution: 'ALPHA', openingBalanceCents: 0, openingDate: '2026-10-01' },
    { name: 'Cash', kind: 'CASH', institution: 'OTHER', openingBalanceCents: 0, openingDate: '2026-10-01' },
  ])
  const groupId = await createCategory({ name: 'Έξοδα', type: 'EXPENSE' })
  const groceriesId = await createCategory({ name: 'Σούπερ μάρκετ', parentId: groupId })
  const andreasId = await createMember({ name: 'Ανδρέας', colour: 'blue' })
  const mariaId = await createMember({ name: 'Μαρία', colour: 'purple' })
  return { bankId, cashId, groceriesId, andreasId, mariaId }
}

const expense = (accountId: string, categoryId: string, extra: Record<string, unknown> = {}) => ({
  kind: 'EXPENSE', accountId, amountCents: 1000, bookedAt: '2026-10-02', categoryId, ...extra,
})

beforeEach(() => resetTestDb())

describe('members', () => {
  it('should list members in creation order with how many rows are for each', async () => {
    const { bankId, groceriesId, mariaId } = await setup()
    await createTransaction(expense(bankId, groceriesId, { memberId: mariaId }))
    expect((await listMembers()).map(m => [m.name, m.colour, m.transactionCount])).toEqual([
      ['Ανδρέας', 'blue', 0],
      ['Μαρία', 'purple', 1],
    ])
  })

  it('should refuse a blank name, an unknown colour and a name another parent has (ignoring case and accents)', async () => {
    await createMember({ name: 'Μαρία', colour: 'blue' })
    await expect(createMember({ name: '  ', colour: 'blue' })).rejects.toThrow('INVALID_INPUT')
    await expect(createMember({ name: 'Ana', colour: 'pink' })).rejects.toThrow('INVALID_INPUT')
    await expect(createMember({ name: 'μαρια', colour: 'green' })).rejects.toThrow('MEMBER_NAME_TAKEN')
  })

  it('should rename and recolour a member, keeping its own name free', async () => {
    const id = await createMember({ name: 'Andreas', colour: 'blue' })
    await updateMember(id, { name: 'Andreas', colour: 'green' })
    await updateMember(id, { name: 'Αντρέας', colour: 'green' })
    expect((await listMembers())[0]).toMatchObject({ name: 'Αντρέας', colour: 'green' })
    await expect(updateMember('nope', { name: 'X', colour: 'blue' })).rejects.toThrow('MEMBER_NOT_FOUND')
  })

  it('should hide an archived member, free its name, and refuse a restore that would clash', async () => {
    const id = await createMember({ name: 'Maria', colour: 'blue' })
    await archiveMember(id)
    expect(await listMembers()).toEqual([])
    expect((await listMembers({ includeArchived: true }))[0].archived).toBe(true)
    await createMember({ name: 'Maria', colour: 'green' })
    await expect(archiveMember(id, false)).rejects.toThrow('MEMBER_NAME_TAKEN')
  })

  it('should pick the first colour no active member wears', () => {
    expect(nextFreeColour([])).toBe('blue')
    expect(nextFreeColour([{ colour: 'blue', archived: false }, { colour: 'purple', archived: true }])).toBe('purple')
  })
})

describe('transactions for and entered by a member', () => {
  it('should store who a row is for and who entered it, and keep the entering member on edit', async () => {
    const { bankId, groceriesId, andreasId, mariaId } = await setup()
    const id = await createTransaction(expense(bankId, groceriesId, { memberId: mariaId, createdByMemberId: andreasId }))
    expect((await listTransactions()).rows[0]).toMatchObject({ memberId: mariaId, memberName: 'Μαρία', memberColour: 'purple', createdByName: 'Ανδρέας' })

    await updateTransaction(id, expense(bankId, groceriesId, { memberId: null, createdByMemberId: mariaId }))
    expect(await prisma.transaction.findUnique({ where: { id } })).toMatchObject({ memberId: null, createdByMemberId: andreasId })
  })

  it('should refuse an archived or unknown member as who it is for, but accept an archived one as who entered it', async () => {
    const { bankId, groceriesId, andreasId } = await setup()
    await archiveMember(andreasId)
    await expect(createTransaction(expense(bankId, groceriesId, { memberId: andreasId }))).rejects.toThrow('MEMBER_NOT_FOUND')
    await expect(createTransaction(expense(bankId, groceriesId, { memberId: 'nope' }))).rejects.toThrow('MEMBER_NOT_FOUND')
    await expect(createTransaction(expense(bankId, groceriesId, { createdByMemberId: andreasId }))).resolves.toBeTypeOf('string')
  })

  it('should filter the log by member and by household', async () => {
    const { bankId, groceriesId, mariaId } = await setup()
    await createTransaction(expense(bankId, groceriesId, { memberId: mariaId, payee: 'Lidl' }))
    await createTransaction(expense(bankId, groceriesId, { payee: 'ΔΕΗ' }))
    expect((await listTransactions({ memberId: mariaId })).rows.map(r => r.payee)).toEqual(['Lidl'])
    expect((await listTransactions({ memberId: 'household' })).rows.map(r => r.payee)).toEqual(['ΔΕΗ'])
  })

  it('should set the member of many rows at once and skip transfers', async () => {
    const { bankId, cashId, groceriesId, mariaId } = await setup()
    const id = await createTransaction(expense(bankId, groceriesId))
    await createTransfer({ fromAccountId: bankId, toAccountId: cashId, amountCents: 500, bookedAt: '2026-10-03' })
    const transferRow = (await prisma.transaction.findFirst({ where: { transferId: { not: null } } }))!
    expect(await setMember([id, transferRow.id], mariaId)).toBe(1)
    expect(await setMember([id], null)).toBe(1)
    await expect(setMember([id], 'nope')).rejects.toThrow('MEMBER_NOT_FOUND')
  })

  it('should stamp both sides of a transfer with who entered it', async () => {
    const { bankId, cashId, andreasId } = await setup()
    await createTransfer({ fromAccountId: bankId, toAccountId: cashId, amountCents: 500, bookedAt: '2026-10-03', createdByMemberId: andreasId })
    expect(await prisma.transaction.count({ where: { createdByMemberId: andreasId } })).toBe(2)
  })

  it('should remember the member last used with a payee', async () => {
    const { bankId, groceriesId, mariaId } = await setup()
    await createTransaction(expense(bankId, groceriesId, { memberId: mariaId, payee: 'Zara' }))
    expect((await listPayeeSuggestions()).find(p => p.payee === 'Zara')?.memberId).toBe(mariaId)
  })
})
