import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n/en.json'
import { TOUR_STEPS } from '../../lib/app-tour'

// Server rendering reads a store's initial state, so the tour step comes from a plain stand-in
const state = { tourStep: null as number | null }
vi.mock('../../store/ui', () => ({
  useUiStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), { getState: () => state }),
}))

const { AppTour, TourCard } = await import('./AppTour')

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    interpolation: { escapeValue: false },
  })
})

const noop = vi.fn()
const card = (step: number) => renderToStaticMarkup(<TourCard step={step} onNext={noop} onBack={noop} onSkip={noop} />)

describe('TourCard', () => {
  it('opens with a welcome, a counter and no Back', () => {
    const html = card(0)
    expect(html).toContain('Welcome to Home Budget')
    expect(html).toContain(`Step 1 of ${TOUR_STEPS.length}`)
    expect(html).toContain('Show me around')
    expect(html).toContain('Skip tour')
    expect(html).not.toContain('>Back<')
  })

  it('names a step after its sidebar item', () => {
    const html = card(TOUR_STEPS.findIndex(s => s.id === 'insight'))
    expect(html).toContain('Projections · Reports')
    expect(html).toContain('Back')
    expect(html).toContain('Next')
  })

  it('ends with Done and no Skip, with one primary button', () => {
    const html = card(TOUR_STEPS.length - 1)
    expect(html).toContain('Done')
    expect(html).not.toContain('Skip tour')
    expect(html.match(/btn-primary/g)).toHaveLength(1)
  })
})

describe('AppTour', () => {
  it('renders nothing while no tour is running', () => {
    state.tourStep = null
    expect(renderToStaticMarkup(<AppTour />)).toBe('')
  })
})
