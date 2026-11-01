import { describe, expect, it } from 'vitest'
import { effectiveZoom, toZoomedBox } from './zoom'

function element({ cssZoom, rectWidth = 0, offsetWidth = 0 }: { cssZoom?: number; rectWidth?: number; offsetWidth?: number }) {
  return {
    ...(cssZoom !== undefined ? { currentCSSZoom: cssZoom } : {}),
    offsetWidth,
    getBoundingClientRect: () => ({ width: rectWidth }) as DOMRect,
  }
}

describe('effectiveZoom', () => {
  it('uses currentCSSZoom when the browser has it', () => {
    expect(effectiveZoom(element({ cssZoom: 1.25, rectWidth: 100, offsetWidth: 100 }))).toBe(1.25)
  })

  it('falls back to the visual/layout width ratio', () => {
    expect(effectiveZoom(element({ rectWidth: 90, offsetWidth: 100 }))).toBeCloseTo(0.9)
  })

  it('is 1 for an element with no width', () => {
    expect(effectiveZoom(element({}))).toBe(1)
  })
})

describe('toZoomedBox', () => {
  it('divides defined fields and keeps undefined ones', () => {
    expect(toZoomedBox({ top: 125, left: 250, minWidth: undefined }, 1.25)).toEqual({ top: 100, left: 200, minWidth: undefined })
  })

  it('returns the same box at zoom 1', () => {
    const box = { top: 10, left: 20 }
    expect(toZoomedBox(box, 1)).toBe(box)
  })
})
