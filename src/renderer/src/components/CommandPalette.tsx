import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './ui'
import { Icon } from './shell/icons'
import { useUiStore } from '../store/ui'
import { useLedgerStore } from '../store/ledger'
import { cx } from './ui/cx'
import { buildActions, buildSections, type PaletteItem, type PaletteTarget } from '../lib/command-palette'

export interface CommandPaletteProps {
  onClose: () => void
  onRun: (target: PaletteTarget) => void
}

/** Ctrl+K: one search box over pages, commands and preferences */
export function CommandPalette({ onClose, onRun }: CommandPaletteProps) {
  const { t, i18n } = useTranslation()
  const theme = useUiStore(s => s.theme)
  const currentMemberId = useUiStore(s => s.currentMemberId)
  const members = useLedgerStore(s => s.members)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo<PaletteItem[]>(
    () => buildActions({ t, theme, lang: i18n.language, members, currentMemberId }),
    [t, theme, i18n.language, members, currentMemberId],
  )
  const sections = useMemo(() => buildSections(query, items), [query, items])
  const flat = useMemo(() => sections.flatMap(s => s.items), [sections])

  // The best hit is highlighted, so Enter works straight away
  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector(`#${optionId(active)}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (flat.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive(i => (i + step + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[active]
      if (item) onRun(item.target)
    } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
      // Ctrl+K again closes, like a toggle
      e.preventDefault()
      onClose()
    }
  }

  const trimmed = query.trim()
  const empty = trimmed !== '' && flat.length === 0
  let index = 0

  return (
    <Modal title={t('palette.title')} onClose={onClose} bare size="lg" panelClassName="mt-[6vh] max-h-[70vh] self-start">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4">
        <Icon name="search" size={18} className="shrink-0 text-gray-500" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.title')}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={flat.length > 0 ? optionId(active) : undefined}
          className="min-w-0 flex-1 bg-transparent py-3.5 text-base text-fg outline-none placeholder:text-gray-500"
        />
      </div>

      <div ref={listRef} id="palette-list" role="listbox" aria-label={t('palette.title')} className="min-h-0 flex-1 overflow-y-auto p-2">
        {empty ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-fg">{t('palette.empty', { query: trimmed })}</p>
            <p className="mt-1 text-xs text-gray-500">{t('palette.empty_hint')}</p>
          </div>
        ) : (
          sections.map(section => (
            <div key={section.group} role="group" aria-label={t(`palette.groups.${section.group}`)} className="mb-1 last:mb-0">
              <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {trimmed ? t(`palette.groups.${section.group}`) : t('palette.groups.go_to')}
              </div>
              {section.items.map(item => {
                const i = index++
                return (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    id={optionId(i)}
                    selected={i === active}
                    onHover={() => setActive(i)}
                    onRun={() => onRun(item.target)}
                  />
                )
              })}
            </div>
          ))
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-gray-500">
        <Hint keys={['↑', '↓']} label={t('palette.hint_move')} />
        <Hint keys={['Enter']} label={t('palette.hint_open')} />
        <Hint keys={['Esc']} label={t('palette.hint_close')} />
      </div>
    </Modal>
  )
}

function optionId(i: number): string {
  return `palette-opt-${i}`
}

interface PaletteRowProps {
  item: PaletteItem
  id: string
  selected: boolean
  onHover: () => void
  onRun: () => void
}

function PaletteRow({ item, id, selected, onHover, onRun }: PaletteRowProps) {
  const { t } = useTranslation()
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      // Mouse movement, not entering, so scrolling the list by keyboard keeps the highlight
      onMouseMove={selected ? undefined : onHover}
      onClick={onRun}
      className={cx(
        'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-fg',
        selected && 'bg-blue-50',
      )}
    >
      <Icon name={item.icon} size={16} className={cx('shrink-0', selected ? 'text-blue-600' : 'text-gray-500')} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm" title={item.title}>{item.title}</div>
        {item.subtitle && <div className="truncate text-xs text-gray-500" title={item.subtitle}>{item.subtitle}</div>}
      </div>
      {item.keys && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
          {item.keys.map((combo, ci) => (
            <Fragment key={combo.join('+')}>
              {ci > 0 && <span className="px-0.5">{t('shortcuts.or')}</span>}
              {combo.map(k => <kbd key={k} className="kbd">{k}</kbd>)}
            </Fragment>
          ))}
        </span>
      )}
    </div>
  )
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map(k => <kbd key={k} className="kbd">{k}</kbd>)}
      <span>{label}</span>
    </span>
  )
}
