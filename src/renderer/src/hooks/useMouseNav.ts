import { useEffect, useRef } from 'react'

// MouseEvent.button for the side buttons most mice have
export const MOUSE_BACK = 3
export const MOUSE_FORWARD = 4

/** Mouse back/forward side buttons run `onBack` / `onForward`, like in a browser */
export function useMouseNav(onBack: () => void, onForward: () => void): void {
  // Keep the latest handlers without re-registering the listeners every render
  const ref = useRef({ onBack, onForward })
  ref.current = { onBack, onForward }

  useEffect(() => {
    const isNavButton = (e: MouseEvent) => e.button === MOUSE_BACK || e.button === MOUSE_FORWARD
    // Claimed on both events so Chromium never runs its own history navigation
    function onMouseDown(e: MouseEvent) {
      if (isNavButton(e)) e.preventDefault()
    }
    function onMouseUp(e: MouseEvent) {
      if (!isNavButton(e)) return
      e.preventDefault()
      if (e.button === MOUSE_BACK) ref.current.onBack()
      else ref.current.onForward()
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])
}
