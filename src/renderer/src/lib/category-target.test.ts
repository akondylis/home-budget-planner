import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { parseTarget, transferOptions, transferValue } from './category-target'
import type { AccountSummary } from '../../../shared/ledger'

const t = ((key: string, opts?: { account?: string }) => `${key}:${opts?.account ?? ''}`) as unknown as TFunction
const account = (id: string) => ({ id, name: id, institutionName: null }) as AccountSummary

describe('category targets', () => {
  it('reads a transfer back from its value, anything else as a category', () => {
    expect(parseTarget(transferValue('cash'))).toEqual({ kind: 'transfer', toAccountId: 'cash' })
    expect(parseTarget('power')).toEqual({ kind: 'category', categoryId: 'power' })
  })

  it('puts a heading over one row per account, worded by direction', () => {
    const out = transferOptions([account('Cash'), account('Alpha')], false, t)
    expect(out.map(o => [o.value, o.kind ?? 'option', o.label])).toEqual([
      ['transfer-heading', 'heading', 'picker.transfer_heading:'],
      ['transfer:Cash', 'option', 'picker.transfer_to:Cash'],
      ['transfer:Alpha', 'option', 'picker.transfer_to:Alpha'],
    ])
    expect(transferOptions([account('Cash')], true, t)[1].label).toBe('picker.transfer_from:Cash')
  })

  it('offers nothing, not even a heading, without accounts', () => {
    expect(transferOptions([], false, t)).toEqual([])
  })
})
