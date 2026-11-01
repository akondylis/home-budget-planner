/**
 * App zoom for floating panels.
 *
 * The app zoom is CSS `zoom` on the content wrapper (App.tsx). Panels portaled
 * to <body> sit outside it, so they carry their anchor's zoom themselves; their
 * own top/left/width are then in zoomed px, so visual positions (from
 * getBoundingClientRect) are divided by it.
 */

/** The zoom an element is drawn at (1 outside the zoomed content, e.g. Sidebar, TitleBar) */
export function effectiveZoom(el: Pick<Element, 'getBoundingClientRect'>): number {
  const { currentCSSZoom: css, offsetWidth } = el as { currentCSSZoom?: number; offsetWidth?: number }
  if (typeof css === 'number' && css > 0) return css
  if (typeof offsetWidth === 'number' && offsetWidth > 0) {
    const ratio = el.getBoundingClientRect().width / offsetWidth
    if (ratio > 0) return ratio
  }
  return 1
}

/** Visual-px box → CSS px for an element that carries `zoom` itself; undefined fields stay undefined */
export function toZoomedBox<T extends Record<string, number | undefined>>(pos: T, zoom: number): T {
  if (zoom === 1) return pos
  const out: Record<string, number | undefined> = {}
  for (const [key, value] of Object.entries(pos)) out[key] = value === undefined ? undefined : value / zoom
  return out as T
}
