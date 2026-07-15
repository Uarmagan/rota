import { describe, expect, it } from 'vitest'
import { createEmptyTripIntent } from '../schema/trip-intent'
import { checkGaps } from './gaps'

describe('checkGaps', () => {
  it('treats an assumed destination as immediately searchable', () => {
    const intent = {
      ...createEmptyTripIntent(),
      destination: { iata: 'NRT', city: 'Tokyo', assumed: true },
    }
    expect(checkGaps(intent, null)).toEqual({ kind: 'ready' })
  })
})
