import {
  isResolvedDestination,
  tripIntentSchema,
  type TripIntent,
} from '../../lib/schema/trip-intent'
import { canonicalizePlaces } from '../../lib/engine/normalize'

const KEY = 'rota:intent:v1'

export function saveIntent(intent: TripIntent): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(intent))
  } catch {
    // Persistence is best-effort.
  }
}

export function clearIntent(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Persistence is best-effort.
  }
}

export function loadIntent(): TripIntent | null {
  try {
    const stored = sessionStorage.getItem(KEY)
    if (stored === null) return null
    const parsed = tripIntentSchema.safeParse(JSON.parse(stored))
    if (!parsed.success) return null
    if (
      parsed.data.destination !== null &&
      !isResolvedDestination(parsed.data.destination)
    ) {
      return null
    }
    return canonicalizePlaces(parsed.data)
  } catch {
    return null
  }
}
