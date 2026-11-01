// Scrolls one container only. Element.scrollIntoView also scrolls every ancestor,
// including the overflow-hidden app shell and the document, which shifts the whole window.

export type ScrollBlock = 'start' | 'nearest'

interface VerticalRect {
  top: number
  bottom: number
}

/** The container scrollTop that brings `el` into view (both rects in viewport coordinates). */
export function targetScrollTop(el: VerticalRect, box: VerticalRect, scrollTop: number, block: ScrollBlock): number {
  const above = el.top - box.top
  if (block === 'start' || above < 0) return scrollTop + above
  const below = el.bottom - box.bottom
  return below > 0 ? scrollTop + below : scrollTop
}

export function scrollWithin(
  el: Element,
  container: Element | null,
  block: ScrollBlock,
  behavior: ScrollBehavior = 'auto',
): void {
  if (!container) return
  const top = targetScrollTop(el.getBoundingClientRect(), container.getBoundingClientRect(), container.scrollTop, block)
  if (top !== container.scrollTop) container.scrollTo({ top, behavior })
}
