import type { MouseEvent } from 'react'

/** How a navigation target opens: background = add a tab without leaving the current view */
export type OpenOpts = { background?: boolean }

/**
 * Props that run `open({ background: true })` on a middle click, like a browser's
 * "open in new tab". Also suppresses Chromium's middle-click autoscroll cursor.
 */
export function middleClickProps(open?: (opts: OpenOpts) => void) {
  if (!open) return {}
  return {
    onMouseDown: (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault()
    },
    onAuxClick: (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      e.stopPropagation()
      open({ background: true })
    },
  }
}
