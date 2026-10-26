import { describe, it, expect } from 'vitest'
import { placeHoverCard } from './HoverCard'

const viewport = { width: 1200, height: 800 }
const panel = { width: 256, height: 120 }
const rect = (top: number, left: number, right: number, bottom: number) => ({ top, left, right, bottom })

describe('placeHoverCard', () => {
  it('goes below a row and flips above near the bottom', () => {
    expect(placeHoverCard(rect(100, 50, 400, 140), panel, viewport, 'below')).toEqual({ top: 146, left: 50 })
    expect(placeHoverCard(rect(700, 50, 400, 740), panel, viewport, 'below').top).toBe(700 - 6 - 120)
  })

  it('goes beside a left sidebar item and to the left of a right one', () => {
    expect(placeHoverCard(rect(200, 8, 56, 236), panel, viewport, 'beside')).toEqual({ top: 200, left: 62 })
    expect(placeHoverCard(rect(200, 1144, 1192, 236), panel, viewport, 'beside').left).toBe(1144 - 6 - 256)
  })

  it('stays inside the window', () => {
    const p = placeHoverCard(rect(760, 1100, 1190, 790), panel, viewport, 'beside')
    expect(p.top + panel.height).toBeLessThanOrEqual(viewport.height - 6)
    expect(p.left).toBeGreaterThanOrEqual(6)
  })
})
