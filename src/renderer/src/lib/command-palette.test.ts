import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'
import { buildActions, buildSections, filterItems, rankItem, type PaletteItem } from './command-palette'

const t = ((key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${Object.values(opts).join(',')}` : key)) as unknown as TFunction

function item(title: string, overrides: Partial<PaletteItem> = {}): PaletteItem {
  return { id: title, group: 'actions', title, icon: 'tag', target: { kind: 'tour' }, ...overrides }
}

describe('rankItem', () => {
  it('ignores accents, case and script, so Latin typing finds Greek titles', () => {
    expect(rankItem(item('Ρυθμίσεις'), 'ρυθμισεις')).toBe(0)
    expect(rankItem(item('Ρυθμίσεις'), 'RUTHM')).toBe(0)
    expect(rankItem(item('Μετάβαση σε Ρυθμίσεις'), 'ρυθ')).toBe(1)
  })

  it('needs every word, in any order, across title, subtitle and keywords', () => {
    const it2 = item('Print budget worksheet', { keywords: 'pdf εκτυπωση' })
    expect(rankItem(it2, 'pdf worksheet')).not.toBeNull()
    expect(rankItem(it2, 'εκτυπωση')).toBe(2)
    expect(rankItem(it2, 'pdf excel')).toBeNull()
  })
})

describe('filterItems', () => {
  it('puts prefix hits first and keeps the input order on ties', () => {
    const items = [item('Go to Budget'), item('Budget worksheet'), item('Budget report')]
    expect(filterItems(items, 'budget', 5).map(i => i.title)).toEqual(['Budget worksheet', 'Budget report', 'Go to Budget'])
  })

  it('caps the number of hits', () => {
    const items = Array.from({ length: 9 }, (_, i) => item(`Item ${i}`))
    expect(filterItems(items, 'item', 5)).toHaveLength(5)
  })
})

describe('buildActions', () => {
  const base = { t, theme: 'light' as const, lang: 'el' }

  it('shows shortcut keys from the registry', () => {
    expect(buildActions(base).find(a => a.id === 'shortcut:toggleSidebar')?.keys).toEqual([['Ctrl', '\\']])
  })

  it('offers Print and the keyboard cheat-sheet with their keys', () => {
    const actions = buildActions(base)
    expect(actions.find(a => a.id === 'shortcut:print')?.keys).toEqual([['Ctrl', 'P']])
    expect(actions.find(a => a.id === 'shortcut:showShortcuts')?.title).toBe('shortcuts.open')
  })

  it('offers every page, the app actions, and only the other themes and language', () => {
    const ids = buildActions(base).map(a => a.id)
    expect(ids).toEqual(expect.arrayContaining(['view:overview', 'view:settings', 'tour', 'worksheet', 'dataFolder', 'theme:dark', 'theme:system', 'language:en']))
    expect(ids).not.toContain('theme:light')
    expect(ids).not.toContain('language:el')
  })

  it('adds a bill from Greek or English words', () => {
    const actions = buildActions(base)
    expect(filterItems(actions, 'συνδρομη', 50).map(a => a.id)).toContain('billAdd')
    expect(filterItems(actions, 'add bill', 50).map(a => a.id)).toContain('billAdd')
  })
})

describe('buildSections', () => {
  const actions = buildActions({ t, theme: 'light', lang: 'el' })

  it('shows only the places to go for an empty query', () => {
    const sections = buildSections('  ', actions)
    expect(sections).toHaveLength(1)
    expect(sections[0].items.every(i => i.target.kind === 'view')).toBe(true)
  })

  it('searches every command for a query and returns nothing for a miss', () => {
    expect(buildSections('palette.tour', actions)[0].items[0].id).toBe('tour')
    expect(buildSections('zzz', actions)).toEqual([])
  })
})
