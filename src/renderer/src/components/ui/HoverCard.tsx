import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './cx'

const OPEN_DELAY_MS = 300
/** Grace period to cross the gap between the row and the card */
const CLOSE_DELAY_MS = 150
const PANEL_GAP = 6

export interface HoverCardProps {
  /** Rendered inside the portaled panel */
  content: ReactNode
  children: ReactNode
  /** False when the children hold their own focusable control; focus inside still opens the card */
  focusable?: boolean
  /** `below` the trigger (list rows) or `beside` it (sidebar items); both flip when there is no room */
  side?: 'below' | 'beside'
  /** Panel width class; defaults to `w-80` */
  widthClassName?: string
  /** False renders the children only (e.g. the sidebar shows its labels when expanded) */
  enabled?: boolean
}

type Rect = Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'>
type Size = { width: number; height: number }

/** Where the panel goes: fixed coordinates kept inside the window */
export function placeHoverCard(rect: Rect, panel: Size, viewport: Size, side: 'below' | 'beside'): { top: number; left: number } {
  const clampTop = (top: number) => Math.max(PANEL_GAP, Math.min(top, viewport.height - panel.height - PANEL_GAP))
  const clampLeft = (left: number) => Math.max(PANEL_GAP, Math.min(left, viewport.width - panel.width - PANEL_GAP))
  if (side === 'beside') {
    const fitsRight = rect.right + PANEL_GAP + panel.width <= viewport.width
    return {
      top: clampTop(rect.top),
      left: fitsRight ? rect.right + PANEL_GAP : clampLeft(rect.left - PANEL_GAP - panel.width),
    }
  }
  const fitsBelow = rect.bottom + PANEL_GAP + panel.height <= viewport.height
  return {
    top: fitsBelow ? rect.bottom + PANEL_GAP : Math.max(PANEL_GAP, rect.top - PANEL_GAP - panel.height),
    left: clampLeft(rect.left),
  }
}

/**
 * Wraps a row cell; hovering or focusing it shows `content` in a portaled card.
 * The mouse can move into the card to select and copy its text; events inside it don't reach the row.
 * Show what the row already holds; anything else is fetched when the card opens (alive guard + Spinner).
 */
export function HoverCard({ content, children, focusable = true, side = 'below', widthClassName = 'w-80', enabled = true }: HoverCardProps) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const pointerInPanelRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }
  const close = () => {
    clearTimer()
    pointerInPanelRef.current = false
    setIsOpen(false)
  }
  // Already open: just cancel a pending close
  const openSoon = () => {
    clearTimer()
    if (!isOpen) timerRef.current = window.setTimeout(() => setIsOpen(true), OPEN_DELAY_MS)
  }
  const closeSoon = () => {
    clearTimer()
    timerRef.current = window.setTimeout(close, CLOSE_DELAY_MS)
  }
  const handleBlur = (e: FocusEvent) => {
    const next = e.relatedTarget
    if (pointerInPanelRef.current) return
    if (next instanceof Node && (triggerRef.current?.contains(next) || panelRef.current?.contains(next))) return
    close()
  }
  const stop = (e: SyntheticEvent) => e.stopPropagation()

  useEffect(() => clearTimer, [])
  useEffect(() => { if (!enabled) close() }, [enabled])

  // Fixed position so the list card can't clip it; flip above when there isn't room below.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !panelRef.current) {
      setPosition(null)
      return
    }
    const panel = panelRef.current
    setPosition(placeHoverCard(
      triggerRef.current.getBoundingClientRect(),
      { width: panel.offsetWidth, height: panel.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      side,
    ))
  }, [isOpen, side])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    // Scrolling inside the card must not close it
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && panelRef.current?.contains(e.target))) close()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [isOpen])

  if (!enabled) return <>{children}</>

  return (
    <div
      ref={triggerRef}
      onMouseEnter={openSoon}
      onMouseLeave={closeSoon}
      onFocus={openSoon}
      onBlur={handleBlur}
      tabIndex={focusable ? 0 : undefined}
      className="min-w-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {children}
      {isOpen && createPortal(
        <div
          ref={panelRef}
          role="tooltip"
          style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
          onMouseEnter={() => { pointerInPanelRef.current = true; clearTimer() }}
          onMouseLeave={() => { pointerInPanelRef.current = false; closeSoon() }}
          onClick={stop}
          onMouseDown={stop}
          onMouseUp={stop}
          onDoubleClick={stop}
          onKeyDown={stop}
          onContextMenu={stop}
          className={cx('app-no-drag fixed z-50 cursor-auto select-text rounded-lg border border-line bg-surface p-3 text-sm shadow-lg', widthClassName)}
        >
          {content}
        </div>,
        document.body
      )}
    </div>
  )
}

export type HoverCardDetail = [label: string, value: string | number | null | undefined]

/** Label/value grid; empty values are skipped. Values wrap, never truncate */
export function HoverCardDetails({ details }: { details: HoverCardDetail[] }) {
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {details.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-gray-500">{label}</dt>
          <dd className="break-words text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
