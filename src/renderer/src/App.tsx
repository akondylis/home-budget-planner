import { useEffect, useState } from 'react'
import i18next from './i18n'  // initialise i18next before any component renders
import { TitleBar } from './components/shell/TitleBar'
import { Sidebar } from './components/shell/Sidebar'
import { OverviewScreen } from './pages/OverviewScreen'
import { PlannedScreen } from './pages/PlannedScreen'
import { SettingsScreen } from './pages/SettingsScreen'
import { CommandPalette } from './components/CommandPalette'
import { AppTour } from './components/tour/AppTour'
import { WorksheetPreviewModal } from './components/pdf/WorksheetPreviewModal'
import { useThemeSync } from './hooks/useThemeSync'
import { useShortcuts, type ShortcutAction } from './hooks/useShortcuts'
import { useUiStore } from './store/ui'
import { changeLanguage, changeTheme, swapSidebar, toggleSidebar } from './lib/ui-actions'
import type { PaletteTarget } from './lib/command-palette'
import type { View } from './types'

// ── Zoom ──────────────────────────────────────────────────────────────────────

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.1

function readStoredZoom(): number {
  try {
    const stored = localStorage.getItem('zoomFactor')
    return stored ? parseFloat(stored) : 1.0
  } catch {
    return 1.0
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('overview')
  const [zoom, setZoom] = useState<number>(readStoredZoom)
  const [worksheetOpen, setWorksheetOpen] = useState(false)
  const sidebarPosition = useUiStore(s => s.sidebarPosition)
  const paletteOpen = useUiStore(s => s.paletteOpen)
  // Subscribing re-renders the tree when the date format changes in Settings
  useUiStore(s => s.dateFormat)

  useThemeSync()

  useEffect(() => {
    window.api.getSettings().then(s => {
      useUiStore.getState().setDateFormat(s?.dateFormat)
      // AppSettings is the source of truth for the language once it exists
      if (s?.language && s.language !== i18next.language) void i18next.changeLanguage(s.language)
    }).catch(err => console.error('[settings] load failed:', err))
  }, [])

  // First launch: show the way around once (Settings and Ctrl+K replay it)
  useEffect(() => {
    if (!useUiStore.getState().tourSeen) useUiStore.getState().startTour()
  }, [])

  const commands: Record<ShortcutAction, () => void> = {
    commandPalette: () => useUiStore.getState().setPaletteOpen(!useUiStore.getState().paletteOpen),
    toggleSidebar,
    swapSidebar,
    zoomIn: () => applyZoom(zoom + ZOOM_STEP),
    zoomOut: () => applyZoom(zoom - ZOOM_STEP),
    zoomReset: () => applyZoom(1.0),
  }
  useShortcuts(commands)

  function runPaletteTarget(target: PaletteTarget) {
    useUiStore.getState().setPaletteOpen(false)
    switch (target.kind) {
      case 'view': setView(target.view); break
      case 'shortcut': commands[target.action](); break
      case 'tour': useUiStore.getState().startTour(); break
      case 'worksheet': setWorksheetOpen(true); break
      case 'dataFolder': void window.api.openDataDir(); break
      case 'theme': changeTheme(target.theme); break
      case 'language': void changeLanguage(target.lang); break
    }
  }

  function applyZoom(next: number) {
    const clamped = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 10) / 10
    setZoom(clamped)
    try {
      localStorage.setItem('zoomFactor', String(clamped))
    } catch { /* zoom still applies for this session */ }
  }

  function renderView() {
    switch (view) {
      case 'overview': return <OverviewScreen onPrintWorksheet={() => setWorksheetOpen(true)} />
      case 'settings': return <SettingsScreen />
      default: return <PlannedScreen view={view} />
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-clip bg-bg text-fg">
      <TitleBar
        zoom={zoom}
        zoomMin={ZOOM_MIN}
        zoomMax={ZOOM_MAX}
        onZoomIn={() => applyZoom(zoom + ZOOM_STEP)}
        onZoomOut={() => applyZoom(zoom - ZOOM_STEP)}
        onZoomReset={() => applyZoom(1.0)}
      />
      <div className={`flex min-h-0 flex-1 ${sidebarPosition === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
        <Sidebar view={view} onNavigate={setView} />
        <div className="flex min-w-0 flex-1 flex-col bg-gray-50">
          <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
            {/* Zoom is chosen by the user at runtime */}
            <div style={{ zoom }} className="p-6">
              {renderView()}
            </div>
          </main>
        </div>
      </div>
      {paletteOpen && <CommandPalette onClose={() => useUiStore.getState().setPaletteOpen(false)} onRun={runPaletteTarget} />}
      {worksheetOpen && <WorksheetPreviewModal onClose={() => setWorksheetOpen(false)} />}
      <AppTour />
    </div>
  )
}
