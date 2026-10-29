import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/prisma', async () => (await import('./test-db')).createTestDb())

import { resetTestDb } from './test-db'
import { archiveInstitution, createInstitution, listInstitutions, moveInstitution, updateInstitution } from '../services/institutions'
import { createAccount, listAccounts, updateAccount } from '../services/accounts'
import type { AccountInput } from '../../shared/ledger'

const account = (over: Partial<AccountInput> = {}): AccountInput => ({
  name: 'Main', kind: 'CURRENT', institutionId: null, openingBalanceCents: 0, openingDate: '2026-10-01', ...over,
})
const names = async () => (await listInstitutions()).map(i => i.name)

beforeEach(() => resetTestDb())

describe('starter list', () => {
  it('should list the common Greek banks, then the meal-card issuers', async () => {
    const list = await listInstitutions()
    expect(list.map(i => i.name)).toEqual([
      'Alpha Bank', 'Eurobank', 'Piraeus Bank', 'National Bank (NBG)', 'Revolut', 'Optima bank', 'Viva Wallet', 'Attica Bank', 'Edenred', 'Up Hellas',
    ])
    expect(list.filter(i => i.kind === 'VOUCHER_ISSUER').map(i => i.id)).toEqual(['inst_edenred', 'inst_up_hellas'])
    expect(list.filter(i => i.statementPreset).map(i => [i.id, i.statementPreset])).toEqual([['inst_alpha', 'alpha'], ['inst_eurobank', 'eurobank']])
  })
})

describe('institutions', () => {
  it('should add a bank at the end and give it to an account', async () => {
    const id = await createInstitution({ name: '  Trade Republic ', kind: 'BANK' })
    expect((await names()).at(-1)).toBe('Trade Republic')
    const accountId = await createAccount(account({ institutionId: id }))
    const [saved] = await listAccounts()
    expect([saved.id, saved.institutionId, saved.institutionName]).toEqual([accountId, id, 'Trade Republic'])
    expect((await listInstitutions()).find(i => i.id === id)?.accountCount).toBe(1)
  })

  it('should refuse a name already taken, ignoring case and accents', async () => {
    await expect(createInstitution({ name: 'revolut', kind: 'BANK' })).rejects.toThrow('INSTITUTION_NAME_TAKEN')
    await archiveInstitution('inst_attica')
    await expect(createInstitution({ name: 'ATTICA BANK', kind: 'BANK' })).rejects.toThrow('INSTITUTION_NAME_TAKEN')
    await expect(updateInstitution('inst_nbg', { name: 'Eurobank', kind: 'BANK' })).rejects.toThrow('INSTITUTION_NAME_TAKEN')
    await updateInstitution('inst_nbg', { name: 'Εθνική Τράπεζα', kind: 'BANK' })
    expect(await names()).toContain('Εθνική Τράπεζα')
  })

  it('should refuse an empty name or an unknown kind', async () => {
    await expect(createInstitution({ name: ' ', kind: 'BANK' })).rejects.toThrow('INVALID_INPUT')
    await expect(createInstitution({ name: 'X', kind: 'BROKER' })).rejects.toThrow('INVALID_INPUT')
  })

  it('should keep the kind while accounts of the other kind use it', async () => {
    await createAccount(account({ institutionId: 'inst_revolut' }))
    await expect(updateInstitution('inst_revolut', { name: 'Revolut', kind: 'VOUCHER_ISSUER' })).rejects.toThrow('INSTITUTION_IN_USE')
    await updateInstitution('inst_viva', { name: 'Viva Wallet', kind: 'VOUCHER_ISSUER' })
    expect((await listInstitutions()).find(i => i.id === 'inst_viva')?.kind).toBe('VOUCHER_ISSUER')
  })

  it('should hide an archived bank from new accounts but keep it on the ones that have it', async () => {
    const id = await createAccount(account({ institutionId: 'inst_piraeus' }))
    await archiveInstitution('inst_piraeus')
    expect(await names()).not.toContain('Piraeus Bank')
    expect((await listInstitutions({ includeArchived: true })).find(i => i.id === 'inst_piraeus')?.archived).toBe(true)
    await expect(createAccount(account({ name: 'Other', institutionId: 'inst_piraeus' }))).rejects.toThrow('INSTITUTION_NOT_FOUND')
    await updateAccount(id, account({ name: 'Renamed', institutionId: 'inst_piraeus' }))
    expect((await listAccounts())[0].institutionName).toBe('Piraeus Bank')
    await archiveInstitution('inst_piraeus', false)
    expect(await names()).toContain('Piraeus Bank')
  })

  it('should move a bank one place among the active ones, staying put at the ends', async () => {
    await moveInstitution('inst_revolut', 'up')
    expect((await names()).slice(2, 5)).toEqual(['Piraeus Bank', 'Revolut', 'National Bank (NBG)'])
    await moveInstitution('inst_alpha', 'up')
    expect((await names())[0]).toBe('Alpha Bank')
    await archiveInstitution('inst_eurobank')
    await moveInstitution('inst_piraeus', 'up')
    expect((await names()).slice(0, 2)).toEqual(['Piraeus Bank', 'Alpha Bank'])
    await expect(moveInstitution('inst_alpha', 'sideways')).rejects.toThrow('INVALID_INPUT')
    await expect(moveInstitution('missing', 'up')).rejects.toThrow('INSTITUTION_NOT_FOUND')
  })
})

describe('account bank rules', () => {
  it('should give a meal-voucher card only a voucher issuer or none, and a bank account only a bank', async () => {
    await expect(createAccount(account({ kind: 'MEAL_VOUCHER', institutionId: 'inst_revolut' }))).rejects.toThrow('INVALID_INPUT')
    await expect(createAccount(account({ institutionId: 'inst_edenred' }))).rejects.toThrow('INVALID_INPUT')
    expect(await createAccount(account({ kind: 'MEAL_VOUCHER', institutionId: null }))).toBeTruthy()
    await expect(createAccount(account({ institutionId: 'missing' }))).rejects.toThrow('INSTITUTION_NOT_FOUND')
  })
})
