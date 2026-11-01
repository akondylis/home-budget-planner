import { describe, expect, it } from 'vitest'
import { escapeIcsText, foldIcsLine, isIcsEntry, toIcs } from './ics'

const NOW = new Date('2026-11-01T10:00:00.000Z')

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma and line breaks', () => {
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne')
  })
})

describe('foldIcsLine', () => {
  it('folds at 75 octets without splitting a Greek character', () => {
    const line = `SUMMARY:${'Δ'.repeat(60)}`
    const parts = foldIcsLine(line).split('\r\n')
    const encoder = new TextEncoder()
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every(p => encoder.encode(p).length <= 75)).toBe(true)
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line)
  })
})

describe('toIcs', () => {
  it('writes all-day events with stable uids and reminders', () => {
    const ics = toIcs([
      { uid: 'r1-2026-11-05', day: '2026-11-05', summary: 'ΔΕΗ · −84,00 €', remindDays: 3 },
      { uid: 'r2-2026-11-25', day: '2026-11-25', summary: 'Salary', remindDays: null },
      { uid: 'r3-2026-11-30', day: '2026-11-30', summary: 'Rent', remindDays: 1 },
    ], 'Πληρωμές', NOW)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('UID:r1-2026-11-05@home-budget')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261105')
    expect(ics).toContain('DTEND;VALUE=DATE:20261106')
    expect(ics).toContain('TRIGGER:-P2DT15H')
    expect(ics).toContain('TRIGGER:-PT15H')
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2)
    expect(ics).toContain('DTSTAMP:20261101T100000Z')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('gives the same file for the same entries (re-import updates)', () => {
    const entries = [{ uid: 'a', day: '2026-12-01', summary: 'x' }]
    expect(toIcs(entries, 'c', NOW)).toBe(toIcs(entries, 'c', NOW))
  })
})

describe('isIcsEntry', () => {
  it('checks what arrives over IPC', () => {
    expect(isIcsEntry({ uid: 'a', day: '2026-12-01', summary: 'x' })).toBe(true)
    expect(isIcsEntry({ uid: '', day: '2026-12-01', summary: 'x' })).toBe(false)
    expect(isIcsEntry({ uid: 'a', day: '01/12/2026', summary: 'x' })).toBe(false)
    expect(isIcsEntry({ uid: 'a', day: '2026-12-01', summary: 'x', remindDays: -1 })).toBe(false)
  })
})
