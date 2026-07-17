import { describe, expect, it } from 'vitest'
import {
  modelCallGateSettingsFromEnvironment,
  searchRequestGateConfigFromEnvironment,
} from './request-gate-config'

describe('modelCallGateSettingsFromEnvironment', () => {
  it('provides safe per-process defaults', () => {
    expect(modelCallGateSettingsFromEnvironment({})).toEqual({
      config: {
        maxConcurrency: 4,
        globalCallsPerWindow: 60,
        clientCallsPerWindow: 10,
        windowMs: 60_000,
        maxClientKeys: 1_000,
      },
      trustForwardedAddress: false,
    })
  })

  it('fails closed on invalid environment configuration', () => {
    expect(() =>
      modelCallGateSettingsFromEnvironment({
        ROTA_MODEL_MAX_CONCURRENCY: 'many',
      }),
    ).toThrow('Invalid ROTA_MODEL_MAX_CONCURRENCY')
  })

  it('fails closed on invalid proxy-trust configuration', () => {
    expect(() =>
      modelCallGateSettingsFromEnvironment({
        ROTA_TRUST_FORWARDED_ADDRESS: 'yes',
      }),
    ).toThrow('Invalid ROTA_TRUST_FORWARDED_ADDRESS')
  })
})

describe('searchRequestGateConfigFromEnvironment', () => {
  it('provides the exact independent search defaults', () => {
    expect(searchRequestGateConfigFromEnvironment({})).toEqual({
      maxConcurrency: 8,
      globalCallsPerWindow: 600,
      clientCallsPerWindow: 60,
      windowMs: 600_000,
      maxClientKeys: 1_000,
    })
  })

  it('accepts every search policy override without changing model settings', () => {
    const environment = {
      ROTA_SEARCH_MAX_CONCURRENCY: '9',
      ROTA_SEARCH_GLOBAL_REQUESTS_PER_10_MINUTES: '601',
      ROTA_SEARCH_CLIENT_REQUESTS_PER_10_MINUTES: '61',
      ROTA_SEARCH_MAX_CLIENT_KEYS: '1001',
    }

    expect(searchRequestGateConfigFromEnvironment(environment)).toEqual({
      maxConcurrency: 9,
      globalCallsPerWindow: 601,
      clientCallsPerWindow: 61,
      windowMs: 600_000,
      maxClientKeys: 1_001,
    })
    expect(modelCallGateSettingsFromEnvironment(environment)).toEqual({
      config: {
        maxConcurrency: 4,
        globalCallsPerWindow: 60,
        clientCallsPerWindow: 10,
        windowMs: 60_000,
        maxClientKeys: 1_000,
      },
      trustForwardedAddress: false,
    })
  })

  it.each([
    ['ROTA_SEARCH_MAX_CONCURRENCY', '0'],
    ['ROTA_SEARCH_GLOBAL_REQUESTS_PER_10_MINUTES', '-1'],
    ['ROTA_SEARCH_CLIENT_REQUESTS_PER_10_MINUTES', '1.5'],
    ['ROTA_SEARCH_MAX_CLIENT_KEYS', 'many'],
  ])('fails closed on invalid %s', (name, value) => {
    expect(() =>
      searchRequestGateConfigFromEnvironment({ [name]: value }),
    ).toThrow(`Invalid ${name}`)
  })
})
