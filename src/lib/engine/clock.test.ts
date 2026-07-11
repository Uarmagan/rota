import { describe, expect, it } from 'vitest'
import { datePart, timeOfDayMinutes, wallClockMinutes } from './clock'

describe('local wall-clock helpers', () => {
  it('returns minutes since local midnight', () => {
    expect(timeOfDayMinutes('2027-02-01T23:50')).toBe(1430)
  })

  it('returns the date part', () => {
    expect(datePart('2027-02-01T23:50')).toBe('2027-02-01')
  })

  it('supports same-airport differences across midnight', () => {
    const before = wallClockMinutes('2027-02-01T23:50')
    const after = wallClockMinutes('2027-02-02T04:10')

    expect(after - before).toBe(260)
  })

  it('rejects malformed local timestamps', () => {
    expect(() => timeOfDayMinutes('2027-02-01 23:50')).toThrow(
      'Invalid local wall-clock timestamp',
    )
  })
})
