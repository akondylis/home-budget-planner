import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Field, ListCard, PageHeader, Segmented, Select } from '../components/ui'
import { useUiStore, type SidebarPosition, type ThemeMode } from '../store/ui'
import { changeLanguage, changeSidebarPosition, changeTheme } from '../lib/ui-actions'
import { DATE_FORMATS, formatDate, type DateFormat } from '../lib/date-format'
import type { AppLanguage } from '../types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ListCard className="p-6">
      <h2 className="mb-4 text-sm font-semibold text-fg">{title}</h2>
      <div className="space-y-5">{children}</div>
    </ListCard>
  )
}

export function SettingsScreen() {
  const { t, i18n } = useTranslation()
  const [portable, setPortable] = useState(false)
  const theme = useUiStore(s => s.theme)
  const sidebarPosition = useUiStore(s => s.sidebarPosition)
  const dateFormat = useUiStore(s => s.dateFormat)
  const [dataDir, setDataDir] = useState('')

  useEffect(() => {
    window.api.getAppInfo().then(info => {
      setDataDir(info.dataDir)
      setPortable(info.portable)
    }).catch(() => setDataDir(''))
  }, [])

  async function changeDateFormat(format: DateFormat) {
    useUiStore.getState().setDateFormat(format)
    await window.api.setDateFormat(format)
  }

  const sample = new Date(new Date().getFullYear(), 2, 25)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={t('settings.title')} />

      <Section title={t('settings.appearance')}>
        <Field label={t('appearance.theme')}>
          <Segmented<ThemeMode>
            label={t('appearance.theme')}
            value={theme}
            onChange={changeTheme}
            options={[
              { value: 'light', label: t('appearance.theme_light'), icon: 'sun' },
              { value: 'dark', label: t('appearance.theme_dark'), icon: 'moon' },
              { value: 'system', label: t('appearance.theme_system'), icon: 'monitor' },
            ]}
          />
        </Field>
        <Field label={t('appearance.sidebar_side')}>
          <Segmented<SidebarPosition>
            label={t('appearance.sidebar_side')}
            value={sidebarPosition}
            onChange={changeSidebarPosition}
            options={[
              { value: 'left', label: t('appearance.left') },
              { value: 'right', label: t('appearance.right') },
            ]}
          />
        </Field>
      </Section>

      <Section title={t('settings.language')}>
        <Field label={t('settings.language')}>
          <Segmented<AppLanguage>
            label={t('settings.language')}
            value={i18n.language === 'en' ? 'en' : 'el'}
            onChange={changeLanguage}
            options={[
              { value: 'el', label: 'Ελληνικά' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Field>
        <Field label={t('settings.date_format')} htmlFor="date-format" hint={t('settings.date_format_hint')}>
          <Select
            id="date-format"
            value={dateFormat}
            onChange={e => changeDateFormat(e.target.value as DateFormat)}
            className="w-64"
          >
            {DATE_FORMATS.map(f => (
              <option key={f} value={f}>{formatDate(sample, f)}</option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title={t('settings.help')}>
        <Field label={t('tour.take')} hint={t('settings.tour_hint')}>
          <Button icon="flag" onClick={() => useUiStore.getState().startTour()}>
            {t('tour.take')}
          </Button>
        </Field>
      </Section>

      <Section title={t('settings.about')}>
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          {t('app.title')} · {t('settings.version', { version: __APP_VERSION__ })}
          {portable && <Badge tone="info" icon="usb" title={t('portable.badge_hint')}>{t('portable.badge')}</Badge>}
        </div>
        <Field label={t('settings.data_folder')} hint={portable ? `${dataDir} · ${t('portable.data_hint')}` : dataDir}>
          <Button icon="folder" onClick={() => window.api.openDataDir()}>
            {t('settings.open_data_folder')}
          </Button>
        </Field>
      </Section>
    </div>
  )
}
