import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { DEFAULT_DATE_FORMAT, getDateFormat, setDateFormat, type DateFormat } from '../lib/date-format'

export type ThemeMode = 'light' | 'dark' | 'system'
export type SidebarPosition = 'left' | 'right'

export const SIDEBAR_MIN_WIDTH = 160
export const SIDEBAR_MAX_WIDTH = 400
export const SIDEBAR_DEFAULT_WIDTH = 224

type UiStore = {
  theme: ThemeMode
  sidebarPosition: SidebarPosition
  sidebarCollapsed: boolean
  // Expanded width in px; the collapsed width stays fixed
  sidebarWidth: number
  // Saved in AppSettings (main also uses it for exports), so not persisted here
  dateFormat: DateFormat
  // CollapsibleCard ids the user folded away (e.g. 'overview.upcoming'); every card starts open
  collapsedSections: string[]
  // Command palette (Ctrl+K) is showing; per session
  paletteOpen: boolean
  // Keyboard cheat-sheet (? / F1) is showing; per session
  shortcutsOpen: boolean
  // What Ctrl+P prints on the page on screen (usePrintShortcut); null = the monthly worksheet
  printTarget: (() => void) | null
  // The app tour has been finished or skipped once; it starts by itself only before that
  tourSeen: boolean
  // Step of the running app tour, null when it isn't showing; per session
  tourStep: number | null
  // The member using the app on this PC (stamped on what they enter); per PC, not in the database
  currentMemberId: string | null
  setTheme: (theme: ThemeMode) => void
  setSidebarPosition: (position: SidebarPosition) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setSidebarWidth: (width: number) => void
  toggleSidebar: () => void
  swapSidebarPosition: () => void
  setDateFormat: (format: string | null | undefined) => void
  toggleSection: (id: string) => void
  expandSection: (id: string) => void
  setPaletteOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  setPrintTarget: (target: (() => void) | null) => void
  startTour: () => void
  setTourStep: (step: number) => void
  /** Finished or skipped: closes the tour and marks it seen */
  endTour: () => void
  setCurrentMember: (id: string | null) => void
}

export const UI_PREFS_KEY = 'ui-prefs'

// localStorage can throw (blocked storage, private contexts); preferences are a
// convenience, so failures fall back to defaults instead of breaking the app.
export const safeStorage: StateStorage = {
  getItem: name => {
    try { return localStorage.getItem(name) } catch { return null }
  },
  setItem: (name, value) => {
    try { localStorage.setItem(name, value) } catch { /* ignore */ }
  },
  removeItem: name => {
    try { localStorage.removeItem(name) } catch { /* ignore */ }
  },
}

export function clampSidebarWidth(width: number): number {
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)))
}

export function resolveTheme(theme: ThemeMode, systemPrefersDark: boolean): 'light' | 'dark' {
  return theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme
}

export const useUiStore = create<UiStore>()(
  persist(
    set => ({
      theme: 'system',
      sidebarPosition: 'left',
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      dateFormat: DEFAULT_DATE_FORMAT,
      collapsedSections: [],
      paletteOpen: false,
      shortcutsOpen: false,
      printTarget: null,
      tourSeen: false,
      tourStep: null,
      currentMemberId: null,
      setTheme: theme => set({ theme }),
      setSidebarPosition: sidebarPosition => set({ sidebarPosition }),
      setSidebarCollapsed: sidebarCollapsed => set({ sidebarCollapsed }),
      setSidebarWidth: width => set({ sidebarWidth: clampSidebarWidth(width) }),
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      swapSidebarPosition: () =>
        set(s => ({ sidebarPosition: s.sidebarPosition === 'left' ? 'right' : 'left' })),
      setDateFormat: format => {
        setDateFormat(format)
        set({ dateFormat: getDateFormat() })
      },
      toggleSection: id => set(s => ({
        collapsedSections: s.collapsedSections.includes(id)
          ? s.collapsedSections.filter(c => c !== id)
          : [...s.collapsedSections, id],
      })),
      expandSection: id => set(s => (
        s.collapsedSections.includes(id) ? { collapsedSections: s.collapsedSections.filter(c => c !== id) } : s
      )),
      setPaletteOpen: paletteOpen => set({ paletteOpen }),
      setShortcutsOpen: shortcutsOpen => set({ shortcutsOpen }),
      setPrintTarget: printTarget => set({ printTarget }),
      startTour: () => set({ tourStep: 0, paletteOpen: false }),
      setTourStep: tourStep => set({ tourStep }),
      endTour: () => set({ tourStep: null, tourSeen: true }),
      setCurrentMember: currentMemberId => set({ currentMemberId }),
    }),
    {
      name: UI_PREFS_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: s => ({
        theme: s.theme,
        sidebarPosition: s.sidebarPosition,
        sidebarCollapsed: s.sidebarCollapsed,
        sidebarWidth: s.sidebarWidth,
        collapsedSections: s.collapsedSections,
        tourSeen: s.tourSeen,
        currentMemberId: s.currentMemberId,
      }),
    },
  ),
)
