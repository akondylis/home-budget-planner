import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HoverCard, Popover, cx } from '../ui'
import { Icon } from '../shell/icons'
import { MemberDot } from './MemberDot'
import { useLedgerStore } from '../../store/ledger'
import { useUiStore } from '../../store/ui'
import { activeMembers, initialOf } from '../../lib/members'

export interface MemberSwitcherProps {
  collapsed: boolean
  /** Opens Settings → Household */
  onManage: () => void
}

const ROW = 'flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm transition-colors'

/** Sidebar chip: who is using the app on this PC; what they enter is stamped with their name */
export function MemberSwitcher({ collapsed, onManage }: MemberSwitcherProps) {
  const { t } = useTranslation()
  const members = useLedgerStore(s => s.members)
  const loaded = useLedgerStore(s => s.loaded)
  const currentMemberId = useUiStore(s => s.currentMemberId)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  if (!loaded) return null
  const active = activeMembers(members)
  const current = active.find(m => m.id === currentMemberId) ?? null

  // No parents yet: the chip is the way in to adding them
  if (active.length === 0) {
    const label = t('members.add_parents')
    return (
      <HoverCard enabled={collapsed} focusable={false} side="beside" widthClassName="w-64" content={<span className="font-semibold text-fg">{label}</span>}>
        <button data-tour="member" onClick={onManage} aria-label={collapsed ? label : undefined} className={cx(ROW, 'text-fg-muted hover:bg-gray-100 hover:text-fg')}>
          <Icon name="user-plus" className="shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </button>
      </HoverCard>
    )
  }

  const label = current ? current.name : t('members.who_is_using')
  const hint = current ? t('members.using_hint', { name: current.name }) : t('members.who_is_using_hint')

  function choose(id: string) {
    useUiStore.getState().setCurrentMember(id)
    setOpen(false)
  }

  return (
    <>
      <HoverCard
        enabled={collapsed && !open}
        focusable={false}
        side="beside"
        widthClassName="w-64"
        content={<><div className="font-semibold text-fg">{label}</div><p className="mt-1 text-xs text-fg-muted">{hint}</p></>}
      >
        <button
          ref={anchorRef}
          data-tour="member"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={collapsed ? label : undefined}
          title={collapsed ? undefined : hint}
          className={cx(ROW, current ? 'text-fg hover:bg-gray-100' : 'text-amber-700 hover:bg-amber-50')}
        >
          {current ? (
            collapsed ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">
                {initialOf(current.name)}
              </span>
            ) : (
              <MemberDot colour={current.colour} size="md" className="ml-1 shrink-0" />
            )
          ) : (
            <Icon name="user" className="shrink-0" />
          )}
          {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
          {!collapsed && <Icon name="chevron-down" size={14} className="shrink-0 text-gray-500" />}
        </button>
      </HoverCard>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} className="w-60 rounded-md border border-line bg-surface p-1 shadow-lg">
        <div role="menu" aria-label={t('members.who_is_using')}>
          <p className="px-2.5 pb-1 pt-1.5 text-xs text-gray-500">{t('members.who_is_using')}</p>
          {active.map(m => (
            <button
              key={m.id}
              role="menuitemradio"
              aria-checked={m.id === currentMemberId}
              onClick={() => choose(m.id)}
              className="flex h-9 w-full items-center gap-2 rounded px-2.5 text-sm text-fg hover:bg-gray-100"
            >
              <MemberDot colour={m.colour} name={m.name} size="md" className="flex-1" />
              {m.id === currentMemberId && <Icon name="check" size={16} className="shrink-0 text-accent" />}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
            className="flex h-9 w-full items-center gap-2 rounded px-2.5 text-sm text-fg-muted hover:bg-gray-100 hover:text-fg"
          >
            <Icon name="users" size={16} />
            {t('members.manage')}
          </button>
        </div>
      </Popover>
    </>
  )
}
