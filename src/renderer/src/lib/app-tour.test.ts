import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import el from '../i18n/el.json'
import {
  TOUR_STEPS,
  clampStep,
  isLastStep,
  placeTourCard,
  stepTargetBox,
  tourKeyAction,
  unionBox,
} from './app-tour'
import { FOOTER_NAV_ITEMS, MAIN_NAV_ITEMS } from './nav-items'

const viewport = { width: 1200, height: 800 }
const card = { width: 320, height: 180 }
const box = (top: number, left: number, right: number, bottom: number) => ({ top, left, right, bottom })

describe('steps', () => {
  it('stay within the first and last step', () => {
    expect(clampStep(-1)).toBe(0)
    expect(clampStep(99)).toBe(TOUR_STEPS.length - 1)
    expect(isLastStep(TOUR_STEPS.length - 1)).toBe(true)
    expect(isLastStep(0)).toBe(false)
  })

  it('open on a centred welcome and point only at real anchors', () => {
    expect(TOUR_STEPS[0].anchors).toHaveLength(0)
    const known = new Set<string>([...MAIN_NAV_ITEMS, ...FOOTER_NAV_ITEMS].map(n => n.id as string).concat('search', 'member'))
    for (const step of TOUR_STEPS) for (const anchor of step.anchors) expect(known).toContain(anchor)
  })

  it('have a title and body in both languages', () => {
    for (const lang of [en, el]) {
      for (const { id } of TOUR_STEPS) {
        expect(lang.tour.steps[id].title).toBeTruthy()
        expect(lang.tour.steps[id].body).toBeTruthy()
      }
    }
  })
})

describe('stepTargetBox', () => {
  const el = (rect: ReturnType<typeof box>) => ({
    getBoundingClientRect: () => ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }),
  })

  it('wraps every target of a step and skips hidden ones', () => {
    const found: Record<string, unknown[]> = {
      '[data-tour="projections"]': [el(box(100, 0, 200, 136))],
      '[data-tour="reports"]': [el(box(140, 0, 200, 176)), el(box(0, 0, 0, 0))],
    }
    const root = { querySelectorAll: (sel: string) => found[sel] ?? [] } as unknown as ParentNode
    const reports = TOUR_STEPS.find(s => s.id === 'insight')!
    expect(stepTargetBox(reports, root)).toEqual(box(100, 0, 200, 176))
  })

  it('is null when nothing is rendered', () => {
    const root = { querySelectorAll: () => [] } as unknown as ParentNode
    expect(stepTargetBox(TOUR_STEPS[1], root)).toBeNull()
    expect(unionBox([])).toBeNull()
  })
})

describe('placeTourCard', () => {
  it('centres the card without a target', () => {
    expect(placeTourCard(null, card, viewport)).toEqual({ top: 310, left: 440 })
  })

  it('goes beside a left sidebar item, lined up with it', () => {
    expect(placeTourCard(box(200, 8, 216, 236), card, viewport)).toEqual({ top: 128, left: 228 })
  })

  it('goes to the left of a right sidebar item', () => {
    expect(placeTourCard(box(200, 980, 1192, 236), card, viewport)).toEqual({ top: 128, left: 648 })
  })

  it('goes below a wide target at the top and stays inside the window', () => {
    expect(placeTourCard(box(4, 0, 1200, 28), card, viewport)).toEqual({ top: 40, left: 440 })
    // Near the bottom edge it is pushed up
    expect(placeTourCard(box(760, 8, 216, 792), card, viewport).top).toBe(800 - 180 - 8)
  })
})

describe('tourKeyAction', () => {
  it('maps Enter/→ to next, ← to back and Esc to skip', () => {
    expect(tourKeyAction('Enter')).toBe('next')
    expect(tourKeyAction('ArrowRight')).toBe('next')
    expect(tourKeyAction('ArrowLeft')).toBe('back')
    expect(tourKeyAction('Escape')).toBe('skip')
    expect(tourKeyAction('a')).toBeNull()
  })
})
