import type { ModelCallGateConfig, RequestGateConfig } from './request-gate'

export interface ModelCallGateSettings {
  config: ModelCallGateConfig
  trustForwardedAddress: boolean
}

const ONE_MINUTE_MS = 60_000
const TEN_MINUTES_MS = 600_000

export function modelCallGateSettingsFromEnvironment(
  environment: Record<string, string | undefined>,
): ModelCallGateSettings {
  return {
    config: {
      maxConcurrency: positiveIntegerEnvironment(
        environment,
        'ROTA_MODEL_MAX_CONCURRENCY',
        4,
      ),
      globalCallsPerWindow: positiveIntegerEnvironment(
        environment,
        'ROTA_MODEL_GLOBAL_CALLS_PER_MINUTE',
        60,
      ),
      clientCallsPerWindow: positiveIntegerEnvironment(
        environment,
        'ROTA_MODEL_CLIENT_CALLS_PER_MINUTE',
        10,
      ),
      windowMs: ONE_MINUTE_MS,
      maxClientKeys: positiveIntegerEnvironment(
        environment,
        'ROTA_MODEL_MAX_CLIENT_KEYS',
        1_000,
      ),
    },
    trustForwardedAddress: booleanEnvironment(
      environment,
      'ROTA_TRUST_FORWARDED_ADDRESS',
      false,
    ),
  }
}

export function searchRequestGateConfigFromEnvironment(
  environment: Record<string, string | undefined>,
): RequestGateConfig {
  return {
    maxConcurrency: positiveIntegerEnvironment(
      environment,
      'ROTA_SEARCH_MAX_CONCURRENCY',
      8,
    ),
    globalCallsPerWindow: positiveIntegerEnvironment(
      environment,
      'ROTA_SEARCH_GLOBAL_REQUESTS_PER_10_MINUTES',
      600,
    ),
    clientCallsPerWindow: positiveIntegerEnvironment(
      environment,
      'ROTA_SEARCH_CLIENT_REQUESTS_PER_10_MINUTES',
      60,
    ),
    windowMs: TEN_MINUTES_MS,
    maxClientKeys: positiveIntegerEnvironment(
      environment,
      'ROTA_SEARCH_MAX_CLIENT_KEYS',
      1_000,
    ),
  }
}

function positiveIntegerEnvironment(
  environment: Record<string, string | undefined>,
  name: string,
  defaultValue: number,
): number {
  const rawValue = environment[name]
  if (rawValue === undefined || rawValue === '') return defaultValue
  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}`)
  }
  return value
}

function booleanEnvironment(
  environment: Record<string, string | undefined>,
  name: string,
  defaultValue: boolean,
): boolean {
  const rawValue = environment[name]
  if (rawValue === undefined || rawValue === '') return defaultValue
  if (rawValue === 'true') return true
  if (rawValue === 'false') return false
  throw new Error(`Invalid ${name}`)
}
