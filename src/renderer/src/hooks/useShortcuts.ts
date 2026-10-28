import { useEffect, useRef } from 'react'
import { isModalOpen } from '../components/ui/Modal'
import { useUiStore } from '../store/ui'

export type ShortcutAction =
  | 'commandPalette'
  | 'addTransaction'
  | 'print'
  | 'navBack'
  | 'navForward'
  | 'showShortcuts'
  | 'toggleSidebar'
  | 'swapSidebar'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'

export type ShortcutGroup = 'general' | 'view'

export interface ShortcutDef {
  action: ShortcutAction
  group: ShortcutGroup
  /** Key combinations shown in the cheat-sheet, palette and tooltips; each inner array is one combination */
  keys: string[][]
}

/** Every app shortcut, in cheat-sheet order. Labels: `shortcuts.actions.<action>` */
export const SHORTCUTS: readonly ShortcutDef[] = [
  { action: 'commandPalette', group: 'general', keys: [['Ctrl', 'K']] },
  { action: 'addTransaction', group: 'general', keys: [['Ctrl', 'N']] },
  { action: 'print', group: 'general', keys: [['Ctrl', 'P']] },
  { action: 'navBack', group: 'general', keys: [['Alt', '←']] },
  { action: 'navForward', group: 'general', keys: [['Alt', '→']] },
  { action: 'showShortcuts', group: 'general', keys: [['?'], ['F1']] },
  { action: 'toggleSidebar', group: 'view', keys: [['Ctrl', '\\']] },
  { action: 'swapSidebar', group: 'view', keys: [['Ctrl', 'Shift', '\\']] },
  { action: 'zoomIn', group: 'view', keys: [['Ctrl', '+']] },
  { action: 'zoomOut', group: 'view', keys: [['Ctrl', '−']] },
  { action: 'zoomReset', group: 'view', keys: [['Ctrl', '0']] },
]

// Still work while a dialog is open; the rest belong to the page behind it
const MODAL_SAFE = new Set<ShortcutAction>(['toggleSidebar', 'swapSidebar', 'zoomIn', 'zoomOut', 'zoomReset'])

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

/**
 * Maps a keydown to an app shortcut. Letter shortcuts match on `code` (physical
 * key) so they work on the Greek layout too.
 */
export function matchShortcut(e: KeyLike): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey
  // Alt+arrows go back and forward like a browser; Alt with anything else is left alone
  if (e.altKey) {
    if (mod || e.shiftKey) return null
    if (e.key === 'ArrowLeft') return 'navBack'
    if (e.key === 'ArrowRight') return 'navForward'
    return null
  }

  if (!mod) {
    if (e.key === 'F1') return 'showShortcuts'
    if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) return 'showShortcuts'
    return null
  }

  if (e.code === 'Backslash' || e.code === 'IntlBackslash') {
    return e.shiftKey ? 'swapSidebar' : 'toggleSidebar'
  }
  if (e.key === '=' || e.key === '+') return 'zoomIn'
  if (e.key === '-') return 'zoomOut'
  if (e.key === '0') return 'zoomReset'
  if (e.shiftKey) return null
  if (e.code === 'KeyK') return 'commandPalette'
  if (e.code === 'KeyN') return 'addTransaction'
  if (e.code === 'KeyP') return 'print'
  return null
}

/** Focus is somewhere the user types, so unmodified keys are text, not shortcuts */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.matches('input, textarea, select')
}

/** Registers one window-level keydown listener that dispatches app shortcuts. */
export function useShortcuts(handlers: Record<ShortcutAction, (e: KeyboardEvent) => void>): void {
  // Keep the latest handlers without re-registering the listener every render
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return
      const action = matchShortcut(e)
      if (!action) return
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey || e.altKey
      if (!mod && isTypingTarget(e.target)) return
      e.preventDefault()
      if (isModalOpen() && !MODAL_SAFE.has(action)) return
      ref.current[action](e)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** Makes Ctrl+P run `onPrint` while the calling page is on screen; `enabled` false leaves it unbound */
export function usePrintShortcut(onPrint: () => void, enabled = true): void {
  const ref = useRef(onPrint)
  ref.current = onPrint

  useEffect(() => {
    if (!enabled) return
    const target = () => ref.current()
    useUiStore.getState().setPrintTarget(target)
    return () => {
      if (useUiStore.getState().printTarget === target) useUiStore.getState().setPrintTarget(null)
    }
  }, [enabled])
}
