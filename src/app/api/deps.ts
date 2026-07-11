import { createSimulatedAvailability } from '../../lib/availability/provider'
import type { AvailabilityProvider } from '../../lib/availability/types'
import type { NormalizeConfig } from '../../lib/engine/normalize'
import type { IntentParser } from '../../lib/parser/intent-parser'
import { OpenAIIntentParser } from '../../lib/parser/openai-intent-parser'
import { OpenAIResultExplainer } from '../../lib/prose/openai-result-explainer'
import type { ResultExplainer } from '../../lib/prose/result-explainer'
import { SUPPORTED_PLACES } from '../../lib/schema/places'
import type { Place } from '../../lib/schema/trip-intent'

export const DEFAULT_ORIGIN: Place = { iata: 'ORD', city: 'Chicago' }
export const NORMALIZE_CONFIG: NormalizeConfig = { defaultOrigin: DEFAULT_ORIGIN }

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function createParser(): IntentParser {
  return new OpenAIIntentParser({
    today: isoToday(),
    supportedPlaces: SUPPORTED_PLACES,
  })
}

export function createProvider(): AvailabilityProvider {
  return createSimulatedAvailability()
}

export function createExplainer(): ResultExplainer {
  return new OpenAIResultExplainer()
}
