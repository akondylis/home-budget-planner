import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './ui'
import { SHORTCUTS, type ShortcutGroup } from '../hooks/useShortcuts'

const GROUPS: ShortcutGroup[] = ['general', 'view']

export interface ShortcutsModalProps {
  onClose: () => void
}

/** Keyboard cheat-sheet, opened with ? or F1; lists every app shortcut */
export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  const { t } = useTranslation()

  return (
    <Modal title={t('shortcuts.title')} subtitle={t('shortcuts.subtitle')} onClose={onClose} size="wide">
      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {GROUPS.map(group => (
          <Section key={group} title={t(`shortcuts.groups.${group}`)}>
            {SHORTCUTS.filter(s => s.group === group).map(s => (
              <Row key={s.action} keys={s.keys} label={t(`shortcuts.actions.${s.action}`)} />
            ))}
          </Section>
        ))}
      </div>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <dl className="divide-y divide-line">{children}</dl>
    </section>
  )
}

function Row({ keys, label }: { keys: string[][]; label: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm text-fg">{label}</dt>
      <dd className="flex shrink-0 flex-wrap items-center justify-end gap-1 text-xs text-gray-500">
        {keys.map((combo, i) => (
          <Fragment key={combo.join('+')}>
            {i > 0 && <span className="px-0.5">{t('shortcuts.or')}</span>}
            {combo.map((k, j) => (
              <Fragment key={k}>
                {j > 0 && <span>+</span>}
                <kbd className="kbd">{k}</kbd>
              </Fragment>
            ))}
          </Fragment>
        ))}
      </dd>
    </div>
  )
}
