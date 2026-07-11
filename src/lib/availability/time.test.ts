import { describe, expect, it } from 'vitest'
import { addMinutes, UTC_OFFSET_MINUTES } from './time'

describe('addMinutes', () => {
  it('rolls across day and month boundaries', () => {
    expect(addMinutes('2027-02-28T23:45', 30)).toBe('2027-03-01T00:15')
  })

  it('constructs the worked ORD to NRT arrival', () => {
    const offsetDelta = UTC_OFFSET_MINUTES.NRT - UTC_OFFSET_MINUTES.ORD
    expect(addMinutes('2027-02-10T18:00', 780 + offsetDelta)).toBe(
      '2027-02-11T22:00',
    )
  })
})
