import { describe, expect, it } from 'vitest'
import { targetScrollTop } from './scroll'

const box = { top: 100, bottom: 500 }

describe('targetScrollTop', () => {
  it('start aligns the element with the container top', () => {
    expect(targetScrollTop({ top: 350, bottom: 400 }, box, 40, 'start')).toBe(290)
    expect(targetScrollTop({ top: 60, bottom: 90 }, box, 40, 'start')).toBe(0)
  })

  it('nearest leaves a fully visible element alone', () => {
    expect(targetScrollTop({ top: 200, bottom: 240 }, box, 40, 'nearest')).toBe(40)
  })

  it('nearest scrolls up for an element above the view', () => {
    expect(targetScrollTop({ top: 80, bottom: 120 }, box, 40, 'nearest')).toBe(20)
  })

  it('nearest scrolls down just enough for an element below the view', () => {
    expect(targetScrollTop({ top: 480, bottom: 530 }, box, 40, 'nearest')).toBe(70)
  })
})
