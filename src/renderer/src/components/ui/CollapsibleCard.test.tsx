import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n/en.json'

// Server rendering reads a store's initial state, so the folded ids come from a plain stand-in
const state = { collapsedSections: [] as string[], toggleSection: vi.fn() }
vi.mock('../../store/ui', () => ({
  useUiStore: (selector: (s: typeof state) => unknown) => selector(state),
}))

const { CollapsibleCard } = await import('./CollapsibleCard')

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    interpolation: { escapeValue: false },
  })
})

const card = () => renderToStaticMarkup(
  <CollapsibleCard id="test.card" title="Games" summary="12 games" actions={<span>filters</span>}>
    <p>body</p>
  </CollapsibleCard>,
)

describe('CollapsibleCard', () => {
  it('shows the body and actions while open, with the summary in the header', () => {
    state.collapsedSections = []
    const html = card()
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('12 games')
    expect(html).toContain('<p>body</p>')
    expect(html).toContain('filters')
  })

  it('unmounts the body and hides the actions when folded, keeping the summary', () => {
    state.collapsedSections = ['test.card']
    const html = card()
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('12 games')
    expect(html).not.toContain('body')
    expect(html).not.toContain('filters')
    expect(html).toContain(`title="${en.ui.expand}"`)
  })
})
