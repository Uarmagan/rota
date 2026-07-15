import { createSimulatedAvailability } from '../../lib/availability/provider'
import type { AvailabilityProvider } from '../../lib/availability/types'
import type { IntentParser } from '../../lib/parser/intent-parser'
import { OpenAIIntentParser } from '../../lib/parser/openai-intent-parser'
import { OpenAIResultExplainer } from '../../lib/prose/openai-result-explainer'
import type { ResultExplainer } from '../../lib/prose/result-explainer'
import {
  SUPPORTED_PLACES,
  airportAliasesForPlaces,
} from '../../lib/schema/places'
import type { Place } from '../../lib/schema/trip-intent'
import { paidRequestLimiterFromEnvironment } from '../../lib/server/paid-request-limiter'
import {
  createModelCallGate,
  createRequestGate,
} from '../../lib/server/request-gate'
import {
  modelCallGateSettingsFromEnvironment,
  searchRequestGateConfigFromEnvironment,
} from '../../lib/server/request-gate-config'

export const DEFAULT_ORIGIN: Place = { iata: 'ORD', city: 'Chicago' }
const modelCallGateSettings = modelCallGateSettingsFromEnvironment(process.env)
export const MODEL_CALL_GATE = createModelCallGate(modelCallGateSettings.config)
export const SEARCH_REQUEST_GATE = createRequestGate(
  searchRequestGateConfigFromEnvironment(process.env),
)
export const PAID_REQUEST_LIMITER =
  paidRequestLimiterFromEnvironment(process.env)
export const TRUST_FORWARDED_ADDRESS =
  modelCallGateSettings.trustForwardedAddress

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function createParser(): IntentParser {
  return new OpenAIIntentParser({
    today: isoToday(),
    supportedPlaces: SUPPORTED_PLACES,
    airportAliases: airportAliasesForPlaces(SUPPORTED_PLACES),
  })
}

export function createProvider(): AvailabilityProvider {
  return createSimulatedAvailability()
}

export function createExplainer(): ResultExplainer {
  return new OpenAIResultExplainer()
}
