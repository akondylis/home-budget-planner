import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { prisma } from '../db/prisma'
import { resetTestDb } from './test-db'
import { createAccounts, listAccounts } from '../services/accounts'
import { createTransaction, listTransactions } from '../services/transactions'
import { seedDefaults } from '../services/seed'
import { clearPreviews, commitImport, listImports, previewImport, undoImport, type PreviewResult } from '../services/import/import-service'

const csv = (lines: string[]) => new TextEncoder().encode(['Ημερομηνία;Περιγραφή;Ποσό', ...lines].join('\r\n'))

const OCTOBER = csv([
  '01/10/2026;POS ΣΚΛΑΒΕΝΙΤΗΣ 1234;-45,20',
  '02/10/2026;ΚΑΦΕ ΜΙΚΡΟ;-2,50',
  '02/10/2026;ΚΑΦΕ ΜΙΚΡΟ;-2,50',
  '05/10/2026;ΜΙΣΘΟΣ ΟΚΤΩΒΡΙΟΥ;1.500,00',
])
// Overlaps October from the 2nd (banks export whole days, so the 2nd repeats as is) and adds November
const OCT_NOV = csv([
  '02/10/2026;ΚΑΦΕ ΜΙΚΡΟ;-2,50',
  '02/10/2026;ΚΑΦΕ ΜΙΚΡΟ;-2,50',
  '05/10/2026;ΜΙΣΘΟΣ ΟΚΤΩΒΡΙΟΥ;1.500,00',
  '03/11/2026;NETFLIX.COM;-13,99',
])

async function setup() {
  await seedDefaults('el')
  const [bankId, cardId, cashId] = await createAccounts([
    { name: 'Alpha', kind: 'CURRENT', institution: 'ALPHA', openingBalanceCents: 100_000, openingDate: '2026-09-30' },
    { name: 'Alpha card', kind: 'CREDIT_CARD', institution: 'ALPHA', openingBalanceCents: 0, openingDate: '2026-09-30' },
    { name: 'Cash', kind: 'CASH', institution: 'OTHER', openingBalanceCents: 0, openingDate: '2026-09-30' },
  ])
  return { bankId, cardId, cashId }
}

async function preview(accountId: string, bytes: Uint8Array, fileName = 'statement.csv') {
  const result = await previewImport(accountId, fileName, bytes)
  if (!result.ok) throw new Error(`preview failed: ${result.reason}`)
  return result as Extract<PreviewResult, { ok: true }>
}

const balanceOf = async (id: string) => (await listAccounts()).find(a => a.id === id)!.balanceCents

beforeEach(() => {
  resetTestDb()
  clearPreviews()
})

describe('statement import', () => {
  it('should import new rows with rule categories and leave the rest to categorise', async () => {
    const { bankId } = await setup()
    const p = await preview(bankId, OCTOBER)
    expect(p.summary.counts).toMatchObject({ NEW: 4, ALREADY_IMPORTED: 0 })
    expect(p.summary).toMatchObject({ dateFrom: '2026-10-01', dateTo: '2026-10-05', toCategorise: 3 })
    expect(p.rows[0].suggestion).toMatchObject({ payee: 'Σκλαβενίτης', source: { kind: 'rule', pattern: 'sklavenitis' } })

    const result = await commitImport({ previewId: p.previewId })
    expect(result).toMatchObject({ importedCount: 4, skippedCount: 0, toCategorise: 3 })
    expect(await balanceOf(bankId)).toBe(100_000 - 4520 - 250 - 250 + 150_000)
    expect((await listAccounts()).find(a => a.id === bankId)?.importedUntil).toBe('2026-10-05')
    expect((await prisma.categoryRule.findFirst({ where: { pattern: 'sklavenitis' } }))?.hitCount).toBe(1)
  })

  it('should import only the new rows of an overlapping file, keeping both identical coffees', async () => {
    const { bankId } = await setup()
    await commitImport({ previewId: (await preview(bankId, OCTOBER)).previewId })
    const p = await preview(bankId, OCT_NOV)
    expect(p.rows.map(r => r.status)).toEqual(['ALREADY_IMPORTED', 'ALREADY_IMPORTED', 'ALREADY_IMPORTED', 'NEW'])
    await commitImport({ previewId: p.previewId })
    expect((await listTransactions({ accountId: bankId })).total).toBe(5)
  })

  it('should recognise the same file, with nothing new in it', async () => {
    const { bankId } = await setup()
    await commitImport({ previewId: (await preview(bankId, OCTOBER)).previewId })
    const again = await preview(bankId, OCTOBER)
    expect(again.sameFile).toMatchObject({ importedCount: 4 })
    expect(again.summary.counts.ALREADY_IMPORTED).toBe(4)
    await expect(commitImport({ previewId: again.previewId })).rejects.toThrow('IMPORT_NOTHING_TO_IMPORT')
  })

  it('should never import twice from one preview (double click)', async () => {
    const { bankId } = await setup()
    const p = await preview(bankId, OCTOBER)
    const results = await Promise.allSettled([commitImport({ previewId: p.previewId }), commitImport({ previewId: p.previewId })])
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(await prisma.transaction.count()).toBe(4)
  })

  it('should skip rows already written when two previews of one file are committed', async () => {
    const { bankId } = await setup()
    const first = await preview(bankId, OCTOBER)
    const second = await preview(bankId, OCTOBER)
    await commitImport({ previewId: first.previewId })
    const result = await commitImport({ previewId: second.previewId })
    expect(result.importedCount).toBe(0)
    expect(await prisma.transaction.count()).toBe(4)
  })

  it('should offer a hand-entered purchase as a twin and link it, so there is still one row', async () => {
    const { cardId } = await setup()
    const groceries = await prisma.category.findFirst({ where: { name: 'Σούπερ μάρκετ' } })
    const handId = await createTransaction({ kind: 'EXPENSE', accountId: cardId, amountCents: 4520, bookedAt: '2026-09-30', categoryId: groceries!.id, payee: 'Σκλαβενίτης' })
    // Card statement: purchases are positive and flipped to money out
    const p = await preview(cardId, csv(['01/10/2026;ΣΚΛΑΒΕΝΙΤΗΣ ΚΗΦΙΣΙΑ;45,20']))
    expect(p.rows[0]).toMatchObject({ status: 'POSSIBLE_DUPLICATE', amountCents: -4520, duplicateOf: { id: handId, payee: 'Σκλαβενίτης' } })

    const result = await commitImport({ previewId: p.previewId, decisions: [{ line: 2, action: 'LINK' }] })
    expect(result).toMatchObject({ importedCount: 0, linkedCount: 1 })
    expect(await prisma.transaction.count()).toBe(1)
    expect(await prisma.transaction.findUnique({ where: { id: handId } })).toMatchObject({
      description: 'ΣΚΛΑΒΕΝΙΤΗΣ ΚΗΦΙΣΙΑ', bookedAt: new Date('2026-10-01T12:00:00Z'), fingerprint: expect.any(String), categoryId: groceries!.id,
    })
    // The next statement knows it
    expect((await preview(cardId, csv(['01/10/2026;ΣΚΛΑΒΕΝΙΤΗΣ ΚΗΦΙΣΙΑ;45,20']))).rows[0].status).toBe('ALREADY_IMPORTED')
  })

  it('should pair a card payment with the card statement, counting it once and never as an expense', async () => {
    const { bankId, cardId } = await setup()
    const bank = await preview(bankId, csv(['05/10/2026;ΠΛΗΡΩΜΗ ΚΑΡΤΑΣ;-300,00']))
    expect(bank.rows[0]).toMatchObject({ status: 'NEW', transferHint: 'CARD_PAYMENT', suggestion: null })
    await commitImport({ previewId: bank.previewId })

    // Card statement prints the payment as a negative amount owed; flipped it is +300 on the card
    const card = await preview(cardId, csv(['07/10/2026;PAYMENT THANK YOU;-300,00', '08/10/2026;NETFLIX;13,99']))
    expect(card.rows[0]).toMatchObject({ status: 'TRANSFER_MATCH', amountCents: 30000, transferWith: { accountId: bankId, accountName: 'Alpha' } })
    await commitImport({ previewId: card.previewId })

    const october = await listTransactions({ month: '2026-10' })
    expect(october.expenseCents).toBe(-1399)
    expect(october.rows.filter(r => r.transferId).map(r => r.amountCents).sort()).toEqual([-30000, 30000])
    expect(await balanceOf(cardId)).toBe(30000 - 1399)
  })

  it('should take the category and payee the user chose over the suggestion', async () => {
    const { bankId } = await setup()
    const kids = await prisma.category.findFirst({ where: { name: 'Παιδιά' } })
    const p = await preview(bankId, OCTOBER)
    await commitImport({ previewId: p.previewId, decisions: [
      { line: 2, action: 'IMPORT', categoryId: kids!.id, payee: 'Σχολικά' },
      { line: 3, action: 'SKIP' },
    ] })
    const rows = (await listTransactions({ accountId: bankId })).rows
    expect(rows).toHaveLength(3)
    expect(rows.find(r => r.description.startsWith('POS'))).toMatchObject({ categoryId: kids!.id, payee: 'Σχολικά' })
  })

  it('should say when the format is unknown or the preview has expired', async () => {
    const { bankId } = await setup()
    expect(await previewImport(bankId, 'x.csv', new TextEncoder().encode('foo;bar\n1;2'))).toMatchObject({ ok: false, reason: 'UNKNOWN_FORMAT' })
    await expect(commitImport({ previewId: 'gone' })).rejects.toThrow('IMPORT_PREVIEW_EXPIRED')
    await expect(previewImport('nope', 'x.csv', OCTOBER)).rejects.toThrow('ACCOUNT_NOT_FOUND')
  })
})

describe('undo import', () => {
  it('should remove the rows, bring the balance back and let the file be imported again', async () => {
    const { bankId } = await setup()
    const before = await balanceOf(bankId)
    const { batchId } = await commitImport({ previewId: (await preview(bankId, OCTOBER)).previewId })
    expect(await undoImport(batchId)).toEqual({ removedCount: 4 })
    expect(await balanceOf(bankId)).toBe(before)
    await expect(undoImport(batchId)).rejects.toThrow('IMPORT_ALREADY_UNDONE')
    const again = await preview(bankId, OCTOBER)
    expect([again.sameFile, again.summary.counts.NEW]).toEqual([null, 4])
    expect((await listImports(bankId)).map(i => i.undone)).toEqual([true])
  })

  it('should unpair the other side of a transfer and keep linked hand-entered rows', async () => {
    const { bankId, cardId, cashId } = await setup()
    await commitImport({ previewId: (await preview(bankId, csv(['05/10/2026;ΠΛΗΡΩΜΗ ΚΑΡΤΑΣ;-300,00']))).previewId })
    const salary = await prisma.category.findFirst({ where: { name: 'Μισθός' } })
    const handId = await createTransaction({ kind: 'INCOME', accountId: cashId, amountCents: 1000, bookedAt: '2026-10-06', categoryId: salary!.id })
    const cashPreview = await preview(cashId, csv(['06/10/2026;ΚΑΤΑΘΕΣΗ;10,00']))
    await commitImport({ previewId: cashPreview.previewId, decisions: [{ line: 2, action: 'LINK' }] })

    const card = await commitImport({ previewId: (await preview(cardId, csv(['07/10/2026;PAYMENT;-300,00']))).previewId })
    await undoImport(card.batchId)
    expect((await prisma.transaction.findFirst({ where: { accountId: bankId } }))?.transferId).toBeNull()

    const cashBatch = (await listImports(cashId))[0]
    await undoImport(cashBatch.id)
    expect(await prisma.transaction.findUnique({ where: { id: handId } })).not.toBeNull()
  })
})
