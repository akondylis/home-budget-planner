// Chart helpers shared by Projections and Reports: the y-axis scale and the month labels. Pure, so they are unit-tested.

import { shortMonthLabel } from './budget'

/** 1, 2 or 5 × a power of ten, at least `raw` */
export function niceStep(raw: number): number {
  if (raw <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const f = raw / power
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power
}

export interface ChartScale {
  min: number
  max: number
  /** Clean values from min to max, 0 among them */
  ticks: number[]
}

/** The y-axis for cents values: always takes in 0 (the line people watch), clean steps of whole euros */
export function chartScale(values: number[], tickCount = 4): ChartScale {
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const step = Math.max(100, niceStep((hi - lo || 10_000) / tickCount))
  const min = Math.floor(lo / step) * step
  const max = Math.max(Math.ceil(hi / step) * step, min + step)
  const ticks: number[] = []
  for (let v = min; v <= max; v += step) ticks.push(v)
  return { min, max, ticks }
}

/** "Mar" for most months, "Jan 27" when the year turns, so a long horizon stays readable */
export function chartMonthLabel(month: string, lang: string): string {
  const [y, m] = month.split('-').map(Number)
  const short = shortMonthLabel(m - 1, lang)
  return m === 1 ? `${short} ${String(y).slice(2)}` : short
}

/** Every k-th x label, so labels never collide (6 → all, 12 → every other, 24 → every third) */
export const labelEvery = (count: number): number => (count <= 8 ? 1 : count <= 14 ? 2 : 3)
