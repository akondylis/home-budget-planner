import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUiStore,
} from '../store/ui'

// Dragging the edge below this width collapses the sidebar to icons only
const COLLAPSE_THRESHOLD = 110
// Matches the collapsed sidebar's Tailwind `w-14`
const COLLAPSED_WIDTH = 56
const KEYBOARD_STEP = 16
const DRAG_BODY_CLASSES = ['select-none', 'cursor-col-resize']

/** Drag, keyboard and double-click handling for the sidebar's resize handle. */
export function useSidebarResize(isLeft: boolean) {
  const width = useUiStore(s => s.sidebarWidth)
  const collapsed = useUiStore(s => s.sidebarCollapsed)
  const setWidth = useUiStore(s => s.setSidebarWidth)
  const setCollapsed = useUiStore(s => s.setSidebarCollapsed)
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, width: 0 })

  // Keep text selection and the resize cursor stable while the pointer is
  // outside the handle
  useEffect(() => {
    if (!dragging) return
    document.body.classList.add(...DRAG_BODY_CLASSES)
    return () => document.body.classList.remove(...DRAG_BODY_CLASSES)
  }, [dragging])

  // The handle grows the sidebar towards the content, so on the right
  // moving the pointer left makes it wider
  const direction = isLeft ? 1 : -1

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, width: collapsed ? COLLAPSED_WIDTH : width }
    setDragging(true)
  }

  // One drag can cross the threshold both ways: out of the icon view to
  // expand, and back in to collapse
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const next = start.current.width + (e.clientX - start.current.x) * direction
    if (next < COLLAPSE_THRESHOLD) {
      if (!collapsed) setCollapsed(true)
      return
    }
    if (collapsed) setCollapsed(false)
    setWidth(next)
  }

  function endDrag() {
    setDragging(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: KEYBOARD_STEP, ArrowLeft: -KEYBOARD_STEP }[e.key]
    if (step !== undefined) {
      const widen = step * direction > 0
      // From the icon view, widening expands at the saved width
      if (collapsed) {
        if (widen) setCollapsed(false)
      } else {
        setWidth(width + step * direction)
      }
    } else if (e.key === 'Home') setWidth(SIDEBAR_MIN_WIDTH)
    else if (e.key === 'End') setWidth(SIDEBAR_MAX_WIDTH)
    else return
    e.preventDefault()
  }

  function onDoubleClick() {
    setCollapsed(false)
    setWidth(SIDEBAR_DEFAULT_WIDTH)
  }

  return {
    width,
    dragging,
    handleProps: {
      role: 'separator',
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': SIDEBAR_MIN_WIDTH,
      'aria-valuemax': SIDEBAR_MAX_WIDTH,
      'aria-valuenow': width,
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick,
      onKeyDown,
    },
  }
}
