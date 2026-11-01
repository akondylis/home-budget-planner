import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { scrollWithin } from '../../lib/scroll'
import { effectiveZoom, toZoomedBox } from '../../lib/zoom'
import { cx } from './cx'

const GAP = 4
/** Minimum distance between the panel and the window's left/right edges */
const EDGE = 8
/** Widest a matchWidth panel gets under a narrow anchor, so its list stays readable */
const MATCH_WIDTH_FLOOR = 320

/** Open popovers, innermost last, so Escape closes only the top one */
const openStack: object[] = []

export type PanelPosition = { top: number; left: number; maxWidth: number; minWidth?: number }

type Box = { top: number; bottom: number; left: number; right: number; width: number }

/**
 * Where the panel goes: below the anchor (above when it doesn't fit), lined up
 * with the anchor's start or end edge (the other edge when that one would leave
 * the window), else shifted inside it; a panel wider than the window is capped to it,
 * and a matchWidth panel to its anchor (at least MATCH_WIDTH_FLOOR)
 */
export function placePanel(
  anchor: Box,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  align: 'start' | 'end',
  matchWidth = false,
): PanelPosition {
  const fitsBelow = anchor.bottom + GAP + panel.height <= viewport.height
  const windowWidth = Math.max(0, viewport.width - 2 * EDGE)
  // A field's dropdown stays as wide as its field (long names wrap), not as wide as its longest option
  const maxWidth = matchWidth ? Math.min(windowWidth, Math.max(anchor.width, MATCH_WIDTH_FLOOR)) : windowWidth
  const width = Math.min(panel.width, maxWidth)
  const fits = (left: number) => left >= EDGE && left + width <= viewport.width - EDGE
  const atStart = anchor.left
  const atEnd = anchor.right - width
  // The requested edge, else the other one (stays under the anchor), else clamped into the window
  const [preferred, other] = align === 'end' ? [atEnd, atStart] : [atStart, atEnd]
  const left = fits(preferred) ? preferred : fits(other) ? other : preferred
  return {
    top: fitsBelow ? anchor.bottom + GAP : Math.max(GAP, anchor.top - GAP - panel.height),
    left: Math.min(Math.max(left, EDGE), viewport.width - width - EDGE),
    maxWidth,
    ...(matchWidth ? { minWidth: Math.min(anchor.width, maxWidth) } : {}),
  }
}

type PanelRef = RefObject<HTMLElement | null>

/** Registers a nested popover's panel with its parent; returns the unregister function */
type RegisterPanel = (panel: PanelRef) => () => void

/**
 * Lets a popover opened from inside another (a dropdown in a filter panel) tell
 * its parent where its portaled panel is, so clicks and scrolls in the child
 * don't count as outside the parent. Context reaches through portals.
 */
const PopoverParentContext = createContext<RegisterPanel | null>(null)

/** The panels of the popovers nested in one popover */
export function createPanelRegistry() {
  const panels = new Set<PanelRef>()
  const register: RegisterPanel = panel => {
    panels.add(panel)
    return () => {
      panels.delete(panel)
    }
  }
  const contains = (target: Node) => [...panels].some(p => p.current?.contains(target) ?? false)
  return { register, contains, size: () => panels.size }
}

/**
 * Escape for a floating panel: joins the shared stack so only the innermost open
 * panel closes, runs in the capture phase (before a parent modal's handler) and
 * returns focus to the anchor. Popover uses it; panels built without Popover
 * (date pickers, input combo-boxes) call it directly.
 */
export function usePopoverEscape(
  open: boolean,
  onClose: () => void,
  anchorRef: RefObject<HTMLElement | null>,
  /** Gets focus back instead of the anchor (e.g. the calendar button of a date field) */
  returnFocusRef?: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) return
    const entry = {}
    openStack.push(entry)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openStack[openStack.length - 1] !== entry) return
      e.preventDefault()
      e.stopPropagation()
      onCloseRef.current()
      // An input anchor keeps focus; refocusing it would reopen combo-boxes that open on focus
      const anchor = anchorRef.current
      if (anchor && !anchor.contains(document.activeElement)) (returnFocusRef?.current ?? anchor).focus()
    }
    // Capture phase, so a modal's own Escape handler doesn't close the modal first
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      openStack.splice(openStack.indexOf(entry), 1)
    }
  }, [open, anchorRef, returnFocusRef])
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'

/**
 * What gets focus when a panel opens: the element marked `data-autofocus`, else the
 * roving-tabindex item inside `data-autofocus-within` (e.g. the day picker's selected day),
 * else the first enabled control inside `data-autofocus-first` (panels with arbitrary children)
 */
export function autofocusTarget(panel: Pick<ParentNode, 'querySelector'>): HTMLElement | null {
  return (
    panel.querySelector<HTMLElement>('[data-autofocus]') ??
    panel.querySelector<HTMLElement>('[data-autofocus-within] [tabindex="0"]') ??
    panel.querySelector<HTMLElement>(FOCUSABLE.split(', ').map(s => `[data-autofocus-first] ${s}`).join(', '))
  )
}

/**
 * Keeps the keyboard-highlighted option visible: scrolls only the list (not the
 * window) to the child marked `data-index={highlighted}`
 */
export function useHighlightIntoView(listRef: RefObject<HTMLElement | null>, highlighted: number) {
  useEffect(() => {
    const list = listRef.current
    if (!list || highlighted < 0) return
    const el = list.querySelector(`[data-index="${highlighted}"]`)
    if (el) scrollWithin(el, list, 'nearest')
  }, [listRef, highlighted])
}

export interface PopoverProps {
  open: boolean
  /** Element the panel attaches to; clicks on it don't count as outside */
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  /** Gets focus back on Escape instead of the anchor (for an anchor that can't take focus) */
  returnFocusRef?: RefObject<HTMLElement | null>
  /** Which anchor edge the panel lines up with */
  align?: 'start' | 'end'
  /** Panel is at least as wide as the anchor */
  matchWidth?: boolean
  className?: string
  children: ReactNode
}

/**
 * Floating panel portaled to <body> with fixed positioning, so scroll
 * containers and sticky headers can't clip or cover it. Flips above the anchor
 * when there isn't room below and shifts sideways to stay inside the window; closes on outside click, outer scroll and resize.
 * Once visible it focuses the element marked `data-autofocus` (React's autoFocus
 * fires while the panel is still hidden, so the browser ignores it); Escape
 * closes the innermost open popover and returns focus to its anchor.
 */
export function Popover({
  open,
  anchorRef,
  onClose,
  returnFocusRef,
  align = 'start',
  matchWidth = false,
  className = 'rounded-md border border-line bg-surface shadow-lg',
  children,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<(PanelPosition & { zoom: number }) | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const registerWithParent = useContext(PopoverParentContext)
  const [nested] = useState(createPanelRegistry)
  const registerChild = useCallback<RegisterPanel>(panel => nested.register(panel), [nested])

  useEffect(() => {
    if (!open || !registerWithParent) return
    return registerWithParent(panelRef)
  }, [open, registerWithParent])

  // Re-measured after every render while open, since content (e.g. search results) changes height
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !panelRef.current) {
      if (position) setPosition(null)
      return
    }
    // All measured in visual px; the panel carries the anchor's zoom (see lib/zoom.ts)
    const zoom = effectiveZoom(anchorRef.current)
    const panelBox = panelRef.current.getBoundingClientRect()
    const next = {
      ...placePanel(
        anchorRef.current.getBoundingClientRect(),
        { width: panelBox.width, height: panelBox.height },
        { width: window.innerWidth, height: window.innerHeight },
        align,
        matchWidth,
      ),
      zoom,
    }
    if (
      !position ||
      position.top !== next.top ||
      position.left !== next.left ||
      position.maxWidth !== next.maxWidth ||
      position.minWidth !== next.minWidth ||
      position.zoom !== next.zoom
    ) {
      setPosition(next)
    }
  })

  // Focus the search field as soon as the panel is shown
  const visible = open && position !== null
  useEffect(() => {
    if (!visible) return
    if (panelRef.current) autofocusTarget(panelRef.current)?.focus()
  }, [visible])

  usePopoverEscape(open, onClose, anchorRef, returnFocusRef)

  useEffect(() => {
    if (!open) return
    const isInside = (target: EventTarget | null) =>
      target instanceof Node &&
      (panelRef.current?.contains(target) || anchorRef.current?.contains(target) || nested.contains(target))

    const handleMouseDown = (e: MouseEvent) => {
      if (!isInside(e.target)) onCloseRef.current()
    }
    // Scrolling the panel's own list must not close it
    const handleScroll = (e: Event) => {
      if (!isInside(e.target)) onCloseRef.current()
    }
    const handleResize = () => onCloseRef.current()

    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open, anchorRef, nested])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      style={{
        zoom: position?.zoom,
        ...toZoomedBox(
          { top: position?.top ?? 0, left: position?.left ?? 0, maxWidth: position?.maxWidth, minWidth: position?.minWidth },
          position?.zoom ?? 1,
        ),
        visibility: position ? 'visible' : 'hidden',
      }}
      className={cx('app-no-drag fixed z-50', className)}
    >
      <PopoverParentContext.Provider value={registerChild}>{children}</PopoverParentContext.Provider>
    </div>,
    document.body,
  )
}
