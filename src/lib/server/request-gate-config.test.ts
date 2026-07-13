import { describe, expect, it } from 'vitest'
import { modelCallGateSettingsFromEnvironment } from './request-gate-config'

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
