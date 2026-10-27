// App tour: the guided walk through the main places of the app.
// Each step highlights the elements marked data-tour="<anchor>" (none = a centred card).
// Labels: tour.steps.<id>.{title,body}

export const TOUR_STEPS = [
  { id: 'welcome', anchors: [] },
  { id: 'overview', anchors: ['overview'] },
  { id: 'transactions', anchors: ['transactions'] },
  { id: 'budget', anchors: ['budget'] },
  { id: 'accounts', anchors: ['accounts'] },
  { id: 'recurring', anchors: ['recurring'] },
  { id: 'debts', anchors: ['debts'] },
  { id: 'insight', anchors: ['projections', 'reports'] },
  { id: 'member', anchors: ['member'] },
  { id: 'settings', anchors: ['settings'] },
  { id: 'search', anchors: ['search'] },
] as const satisfies readonly { id: string; anchors: readonly string[] }[]

export type TourStep = (typeof TOUR_STEPS)[number]

/** Gap between the highlighted area and the card */
const GAP = 12
/** Minimum distance between the card and the window edges */
const EDGE = 8
/** Space the highlight ring adds around its target */
export const TOUR_RING_PAD = 4

export type Box = { top: number; left: number; right: number; bottom: number }
type Size = { width: number; height: number }

export function clampStep(index: number): number {
  return Math.min(Math.max(index, 0), TOUR_STEPS.length - 1)
}

export function isLastStep(index: number): boolean {
  return index >= TOUR_STEPS.length - 1
}

/** One box around all of a step's targets (e.g. Projections + Reports) */
export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  return {
    top: Math.min(...boxes.map(b => b.top)),
    left: Math.min(...boxes.map(b => b.left)),
    right: Math.max(...boxes.map(b => b.right)),
    bottom: Math.max(...boxes.map(b => b.bottom)),
  }
}

/** The on-screen box of a step's targets; null when none is rendered (the card is then centred) */
export function stepTargetBox(step: TourStep, root: ParentNode = document): Box | null {
  const boxes = step.anchors
    .flatMap(anchor => [...root.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)])
    .map(el => el.getBoundingClientRect())
    .filter(r => r.width > 0 && r.height > 0)
  return unionBox(boxes)
}

/**
 * Where the card goes: beside the target (right, then left), else below or above
 * it, else centred; always kept inside the window. No target = centred.
 */
export function placeTourCard(target: Box | null, card: Size, viewport: Size): { top: number; left: number } {
  const clampTop = (top: number) => Math.min(Math.max(top, EDGE), Math.max(EDGE, viewport.height - card.height - EDGE))
  const clampLeft = (left: number) => Math.min(Math.max(left, EDGE), Math.max(EDGE, viewport.width - card.width - EDGE))
  const centred = { top: clampTop((viewport.height - card.height) / 2), left: clampLeft((viewport.width - card.width) / 2) }
  if (!target) return centred

  const midY = (target.top + target.bottom) / 2
  const midX = (target.left + target.right) / 2
  const besideTop = clampTop(midY - card.height / 2)
  const underLeft = clampLeft(midX - card.width / 2)

  if (target.right + GAP + card.width <= viewport.width - EDGE) return { top: besideTop, left: target.right + GAP }
  if (target.left - GAP - card.width >= EDGE) return { top: besideTop, left: target.left - GAP - card.width }
  if (target.bottom + GAP + card.height <= viewport.height - EDGE) return { top: target.bottom + GAP, left: underLeft }
  if (target.top - GAP - card.height >= EDGE) return { top: target.top - GAP - card.height, left: underLeft }
  return centred
}

export type TourKeyAction = 'next' | 'back' | 'skip'

/** Keyboard: Enter/→ next, ← back, Esc skip */
export function tourKeyAction(key: string): TourKeyAction | null {
  switch (key) {
    case 'Enter':
    case 'ArrowRight': return 'next'
    case 'ArrowLeft': return 'back'
    case 'Escape': return 'skip'
    default: return null
  }
}
