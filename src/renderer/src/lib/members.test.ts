import { describe, expect, it } from 'vitest'
import { initialOf, resolveCurrentMember } from './members'
import type { MemberSummary } from '../../../shared/members'

const member = (id: string, archived = false): MemberSummary => ({ id, name: id, colour: 'blue', archived, transactionCount: 0 })

describe('resolveCurrentMember', () => {
  it('should keep the remembered member while active', () => {
    expect(resolveCurrentMember([member('a'), member('b')], 'b')).toBe('b')
  })

  it('should pick the only parent, and nobody when there are two to choose from', () => {
    expect(resolveCurrentMember([member('a'), member('b', true)], null)).toBe('a')
    expect(resolveCurrentMember([member('a'), member('b')], null)).toBeNull()
  })

  it('should drop an archived or deleted member', () => {
    expect(resolveCurrentMember([member('a'), member('b'), member('c', true)], 'c')).toBeNull()
    expect(resolveCurrentMember([], 'gone')).toBeNull()
  })
})

describe('initialOf', () => {
  it('should give the capital first letter, Greek included', () => {
    expect(initialOf(' μαρία')).toBe('Μ')
    expect(initialOf('')).toBe('?')
  })
})
