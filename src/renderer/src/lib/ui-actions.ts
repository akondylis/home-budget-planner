// Shell preference changes with their visual transitions. Shared by the
// titlebar, the keyboard shortcuts, the command palette and Settings.

import { flushSync } from 'react-dom'
import i18next from 'i18next'
import type { AppLanguage } from '../types'
import { useUiStore, type SidebarPosition, type ThemeMode } from '../store/ui'
import { animateThemeChange, withViewTransition } from './transitions'

const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system']

export function changeTheme(theme: ThemeMode): void {
  animateThemeChange()
  useUiStore.getState().setTheme(theme)
}

/** Light → Dark → System → Light. */
export function cycleTheme(): void {
  const current = useUiStore.getState().theme
  changeTheme(THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length])
}

// View transitions snapshot the DOM before and after the callback, so the
// React update must be flushed synchronously inside it.
export function changeSidebarPosition(position: SidebarPosition): void {
  if (useUiStore.getState().sidebarPosition === position) return
  withViewTransition(() => flushSync(() => useUiStore.getState().setSidebarPosition(position)))
}

export function swapSidebar(): void {
  withViewTransition(() => flushSync(() => useUiStore.getState().swapSidebarPosition()))
}

export function toggleSidebar(): void {
  useUiStore.getState().toggleSidebar()
}

/** Switches the UI language now and stores it (localStorage for the first paint, AppSettings for main) */
export async function changeLanguage(lang: AppLanguage): Promise<void> {
  try {
    localStorage.setItem('lang', lang)
  } catch { /* preference only */ }
  await i18next.changeLanguage(lang)
  await window.api.setLanguage(lang)
}
