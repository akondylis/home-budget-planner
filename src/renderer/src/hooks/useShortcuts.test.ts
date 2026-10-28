import { describe, expect, it } from 'vitest'
import { SHORTCUTS, matchShortcut } from './useShortcuts'

type KeyLike = Parameters<typeof matchShortcut>[0]

const key = (k: Partial<KeyLike>): KeyLike => ({ key: '', code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...k })

describe('matchShortcut', () => {
  it('matches letter shortcuts on the physical key, so the Greek layout works', () => {
    expect(matchShortcut(key({ code: 'KeyP', key: 'π', ctrlKey: true }))).toBe('print')
    expect(matchShortcut(key({ code: 'KeyK', key: 'κ', ctrlKey: true }))).toBe('commandPalette')
    expect(matchShortcut(key({ code: 'KeyP', key: 'P', ctrlKey: true, shiftKey: true }))).toBeNull()
  })

  it('goes back and forward with Alt+arrows only', () => {
    expect(matchShortcut(key({ key: 'ArrowLeft', altKey: true }))).toBe('navBack')
    expect(matchShortcut(key({ key: 'ArrowRight', altKey: true }))).toBe('navForward')
    expect(matchShortcut(key({ key: 'ArrowLeft', altKey: true, shiftKey: true }))).toBeNull()
    expect(matchShortcut(key({ key: 'ArrowLeft', altKey: true, ctrlKey: true }))).toBeNull()
    expect(matchShortcut(key({ key: 'ArrowLeft' }))).toBeNull()
  })

  it('opens the cheat-sheet with ? or F1', () => {
    expect(matchShortcut(key({ key: '?', code: 'Slash', shiftKey: true }))).toBe('showShortcuts')
    expect(matchShortcut(key({ key: 'F1', code: 'F1' }))).toBe('showShortcuts')
    expect(matchShortcut(key({ key: 'a', code: 'KeyA' }))).toBeNull()
  })

  it('lists every action once in the cheat-sheet', () => {
    const actions = SHORTCUTS.map(s => s.action)
    expect(new Set(actions).size).toBe(actions.length)
    expect(actions).toEqual(expect.arrayContaining(['print', 'navBack', 'navForward', 'showShortcuts']))
  })
})
