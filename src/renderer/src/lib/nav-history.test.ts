import { describe, expect, it } from 'vitest'
import { EMPTY_NAV_HISTORY, NAV_HISTORY_MAX, canStep, record, step, type NavEntry, type NavHistory } from './nav-history'
import type { View } from '../types'

const all = () => true

function build(...entries: NavEntry[]): NavHistory {
  return entries.reduce(record, EMPTY_NAV_HISTORY)
}

describe('nav-history', () => {
  it('ignores a repeat of the current entry', () => {
    const h = build({ view: 'overview' }, { view: 'overview' })
    expect(h.entries).toHaveLength(1)
  })

  it('records the same view with a different Categories tab as a new step', () => {
    const h = build({ view: 'categories', categoriesTab: 'categories' }, { view: 'categories', categoriesTab: 'rules' })
    expect(h.entries).toHaveLength(2)
  })

  it('drops the forward part when recording after a step back', () => {
    const h = build({ view: 'overview' }, { view: 'budget' }, { view: 'transactions' })
    const back = step(h, -1, all)!
    const next = record(back.history, { view: 'settings' })
    expect(next.entries.map(e => e.view)).toEqual(['overview', 'budget', 'settings'])
    expect(canStep(next, 1, all)).toBe(false)
  })

  it('keeps only the newest entries', () => {
    const views: View[] = ['overview', 'budget']
    let h = EMPTY_NAV_HISTORY
    for (let i = 0; i < NAV_HISTORY_MAX + 10; i++) h = record(h, { view: views[i % 2] })
    expect(h.entries).toHaveLength(NAV_HISTORY_MAX)
    expect(h.index).toBe(NAV_HISTORY_MAX - 1)
  })

  it('steps back and forward', () => {
    const h = build({ view: 'overview' }, { view: 'budget' })
    const back = step(h, -1, all)!
    expect(back.entry.view).toBe('overview')
    const fwd = step(back.history, 1, all)!
    expect(fwd.entry.view).toBe('budget')
  })

  it('skips entries that are no longer valid', () => {
    const h = build({ view: 'overview' }, { view: 'accounts' }, { view: 'budget' })
    const back = step(h, -1, e => e.view !== 'accounts')!
    expect(back.entry.view).toBe('overview')
  })

  it('reports when there is nowhere to go', () => {
    const h = build({ view: 'overview' })
    expect(canStep(h, -1, all)).toBe(false)
    expect(canStep(h, 1, all)).toBe(false)
    expect(step(h, -1, all)).toBeNull()
    expect(canStep(EMPTY_NAV_HISTORY, -1, all)).toBe(false)
  })
})
