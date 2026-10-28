import type { View } from '../types'
import type { CategoriesTab } from './categories'

/** One place the user has been: the view, plus the Categories tab it showed */
export type NavEntry = {
  view: View
  categoriesTab?: CategoriesTab
}

export type NavHistory = { entries: NavEntry[]; index: number }
export type NavDir = -1 | 1

export const NAV_HISTORY_MAX = 50
export const EMPTY_NAV_HISTORY: NavHistory = { entries: [], index: -1 }

export function sameEntry(a: NavEntry, b: NavEntry): boolean {
  return a.view === b.view && (a.categoriesTab ?? null) === (b.categoriesTab ?? null)
}

/** Adds a visit after the current one, dropping the forward part; a repeat of the current entry is ignored */
export function record(h: NavHistory, entry: NavEntry): NavHistory {
  const current = h.entries[h.index]
  if (current && sameEntry(current, entry)) return h
  const entries = [...h.entries.slice(0, h.index + 1), entry].slice(-NAV_HISTORY_MAX)
  return { entries, index: entries.length - 1 }
}

/** Index of the nearest valid entry in that direction, or -1 when there is none */
function nextIndex(h: NavHistory, dir: NavDir, isValid: (e: NavEntry) => boolean): number {
  for (let i = h.index + dir; i >= 0 && i < h.entries.length; i += dir) {
    if (isValid(h.entries[i])) return i
  }
  return -1
}

/** Moves one step back or forward, skipping entries that no longer apply */
export function step(h: NavHistory, dir: NavDir, isValid: (e: NavEntry) => boolean): { history: NavHistory; entry: NavEntry } | null {
  const i = nextIndex(h, dir, isValid)
  if (i < 0) return null
  return { history: { entries: h.entries, index: i }, entry: h.entries[i] }
}

export function canStep(h: NavHistory, dir: NavDir, isValid: (e: NavEntry) => boolean): boolean {
  return nextIndex(h, dir, isValid) >= 0
}
