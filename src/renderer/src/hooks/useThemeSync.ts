import { useEffect } from 'react'
import { resolveTheme, useUiStore, type ThemeMode } from '../store/ui'
import { animateThemeChange } from '../lib/transitions'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Sets or clears the `.dark` class on <html> for the given mode. */
export function applyThemeClass(theme: ThemeMode): void {
  const systemDark = window.matchMedia?.(DARK_QUERY).matches ?? false
  document.documentElement.classList.toggle('dark', resolveTheme(theme, systemDark) === 'dark')
}

/**
 * Keeps <html class="dark"> and Electron's nativeTheme in step with the chosen
 * theme. In System mode it follows OS changes live.
 */
export function useThemeSync(): void {
  const theme = useUiStore(s => s.theme)

  useEffect(() => {
    applyThemeClass(theme)
    window.api.setTheme(theme).catch(err => console.warn('[theme] setTheme failed:', err))

    if (theme !== 'system') return
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => {
      animateThemeChange()
      applyThemeClass('system')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])
}
