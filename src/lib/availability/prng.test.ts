import { describe, expect, it } from 'vitest'
import { hashSeed, mulberry32 } from './prng'

describe('seeded randomness', () => {
  it('replays the same sequence for the same seed', () => {
    const first = mulberry32(12345)
    const second = mulberry32(12345)

    expect([first(), first(), first()]).toEqual([second(), second(), second()])
  })

  it('produces a different sequence for a different seed', () => {
    const first = mulberry32(12345)
    const second = mulberry32(54321)

    expect([first(), first(), first()]).not.toEqual([second(), second(), second()])
  })

  it('hashes source, route, and date components distinctly', () => {
    const baseline = hashSeed('17|meridian|ORD|NRT|2027-02-01|2027-02-28')
    expect(baseline).toBe(hashSeed('17|meridian|ORD|NRT|2027-02-01|2027-02-28'))
    expect(hashSeed('17|aurora|ORD|NRT|2027-02-01|2027-02-28')).not.toBe(baseline)
    expect(hashSeed('17|meridian|NRT|ORD|2027-02-01|2027-02-28')).not.toBe(baseline)
    expect(hashSeed('17|meridian|ORD|NRT|2027-03-01|2027-03-31')).not.toBe(baseline)
  })
})
