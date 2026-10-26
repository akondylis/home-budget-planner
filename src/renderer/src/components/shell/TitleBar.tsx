import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore, type ThemeMode } from '../../store/ui'
import { cycleTheme, swapSidebar } from '../../lib/ui-actions'
import { Icon, type IconName } from './icons'
import { Badge, HoverCard } from '../ui'

const THEME_ICON: Record<ThemeMode, IconName> = { light: 'sun', dark: 'moon', system: 'monitor' }

export interface TitleBarProps {
  zoom: number
  zoomMin: number
  zoomMax: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
}

export function TitleBar({ zoom, zoomMin, zoomMax, onZoomIn, onZoomOut, onZoomReset }: TitleBarProps) {
  const { t } = useTranslation()
  const theme = useUiStore(s => s.theme)
  const [appInfo, setAppInfo] = useState<{ portable: boolean; dataDir: string } | null>(null)

  useEffect(() => {
    window.api.getAppInfo().then(setAppInfo).catch(() => setAppInfo(null))
  }, [])

  const iconBtn =
    // Compact size so the buttons fit the 36px title bar
    'app-no-drag btn-icon btn-icon-sm'

  return (
    <header
      className="app-drag titlebar-inset flex h-9 shrink-0 items-center gap-2 border-b border-line bg-glass/80 pl-3 backdrop-blur-xl"
    >
      <span className="truncate text-xs font-semibold tracking-wide text-fg">{t('app.title')}</span>
      {appInfo?.portable && (
        <div className="app-no-drag">
          <HoverCard
            widthClassName="w-96"
            content={
              <>
                <div className="font-semibold text-fg">{t('portable.badge_hint')}</div>
                <p className="mt-1 break-all text-xs text-fg-muted">{appInfo.dataDir}</p>
                <p className="mt-2 text-xs text-fg-muted">{t('portable.data_hint')}</p>
              </>
            }
          >
            <Badge tone="info" icon="usb">{t('portable.badge')}</Badge>
          </HoverCard>
        </div>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          data-tour="search"
          onClick={() => useUiStore.getState().setPaletteOpen(true)}
          className="app-no-drag mr-1 inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-surface-2 pl-2 pr-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-fg"
          title={t('shortcuts.with_key', { action: t('palette.title'), key: 'Ctrl+K' })}
          aria-label={t('palette.title')}
        >
          <Icon name="search" size={14} />
          <span>{t('palette.button')}</span>
          <kbd className="kbd ml-1 border-b leading-4">Ctrl K</kbd>
        </button>
        <button
          onClick={swapSidebar}
          className={iconBtn}
          title={`${t('shell.swap_sidebar')} (Ctrl+Shift+\\)`}
          aria-label={t('shell.swap_sidebar')}
        >
          <Icon name="swap" size={16} />
        </button>
        <button
          onClick={cycleTheme}
          className={iconBtn}
          title={`${t('appearance.theme')}: ${t(`appearance.theme_${theme}`)}`}
          aria-label={`${t('appearance.theme')}: ${t(`appearance.theme_${theme}`)}`}
        >
          <Icon name={THEME_ICON[theme]} size={16} />
        </button>

        <div className="app-no-drag ml-1 flex items-center gap-0.5 rounded-md border border-line bg-surface-2 px-0.5">
          <button
            onClick={onZoomOut}
            disabled={zoom <= zoomMin}
            className="rounded px-1.5 text-sm leading-6 text-fg-muted hover:bg-gray-100 disabled:opacity-40"
            title={t('ui.zoom_out_tooltip')}
          >
            −
          </button>
          <button
            onClick={onZoomReset}
            className="min-w-[2.75rem] rounded px-1 text-center text-xs leading-6 text-fg-muted hover:bg-gray-100"
            title={t('ui.zoom_reset_tooltip')}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={onZoomIn}
            disabled={zoom >= zoomMax}
            className="rounded px-1.5 text-sm leading-6 text-fg-muted hover:bg-gray-100 disabled:opacity-40"
            title={t('ui.zoom_in_tooltip')}
          >
            +
          </button>
        </div>
      </div>
    </header>
  )
}
