import { describe, expect, it } from 'vitest'
import { rangeKeys } from './range-select'

const order = ['a', 'b', 'c', 'd', 'e']

describe('rangeKeys', () => {
  it('span forward from the anchor to the clicked row', () => {
    expect(rangeKeys(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
  })

  it('span backward in list order', () => {
    expect(rangeKeys(order, 'e', 'c')).toEqual(['c', 'd', 'e'])
  })

  it('cover just the row when anchor and target match', () => {
    expect(rangeKeys(order, 'c', 'c')).toEqual(['c'])
  })

  it('give null without a visible anchor', () => {
    expect(rangeKeys(order, null, 'c')).toBeNull()
    expect(rangeKeys(order, 'z', 'c')).toBeNull()
  })
})
