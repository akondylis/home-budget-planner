// Visual transitions for shell-level changes (theme, sidebar side).

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Runs a layout-changing update as a crossfade when the browser supports it. */
export function withViewTransition(update: () => void): void {
  const doc = document as ViewTransitionDocument
  if (!doc.startViewTransition || prefersReducedMotion()) {
    update()
    return
  }
  doc.startViewTransition(update)
}

let themeAnimTimer: ReturnType<typeof setTimeout> | undefined

/** Briefly enables colour transitions on every element so a theme flip fades. */
export function animateThemeChange(): void {
  if (prefersReducedMotion()) return
  const root = document.documentElement
  root.classList.add('theme-anim')
  clearTimeout(themeAnimTimer)
  themeAnimTimer = setTimeout(() => root.classList.remove('theme-anim'), 200)
}
