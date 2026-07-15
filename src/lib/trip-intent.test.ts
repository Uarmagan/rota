import { describe, expect, it } from 'vitest'
import {
  createEmptyTripIntent,
  tripIntentSchema,
} from './schema/trip-intent'

describe('destination schema', () => {
  it('accepts a closed-list country before engine resolution', () => {
    const intent = {
      ...createEmptyTripIntent(),
      destination: { country: 'Japan' },
    }
    expect(tripIntentSchema.safeParse(intent).success).toBe(true)
  })

  it('requires an assumed flag on a resolved place destination', () => {
    const resolved = {
      ...createEmptyTripIntent(),
      destination: { iata: 'NRT', city: 'Tokyo', assumed: true },
    }
    const missingFlag = {
      ...createEmptyTripIntent(),
      destination: { iata: 'NRT', city: 'Tokyo' },
    }

    expect(tripIntentSchema.safeParse(resolved).success).toBe(true)
    expect(tripIntentSchema.safeParse(missingFlag).success).toBe(false)
  })

  it('rejects a country outside the registry vocabulary', () => {
    const intent = {
      ...createEmptyTripIntent(),
      destination: { country: 'Brazil' },
    }
    expect(tripIntentSchema.safeParse(intent).success).toBe(false)
  })
})
