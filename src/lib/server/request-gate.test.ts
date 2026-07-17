import { describe, expect, it } from 'vitest'
import {
  createRequestGate,
  createModelCallGate,
  type ModelCallGateConfig,
  type RequestGateConfig,
} from './request-gate'

describe('createRequestGate', () => {
  it('caps concurrent model calls and permits work after release', () => {
    const gate = createRequestGate(config({ maxConcurrency: 1 }))

    const first = gate.acquire('client-a')
    const blocked = gate.acquire('client-b')

    expect(first.ok).toBe(true)
    expect(blocked).toEqual({ ok: false, retryAfterMs: 1_000 })
    if (first.ok) first.permit.release()
    expect(gate.acquire('client-b').ok).toBe(true)
  })

  it('limits calls from one client', () => {
    const gate = createRequestGate(config({ clientCallsPerWindow: 1 }))
    const first = gate.acquire('client-a')
    if (first.ok) first.permit.release()

    expect(gate.acquire('client-a')).toEqual({
      ok: false,
      retryAfterMs: 60_000,
    })
  })

  it('limits calls globally across clients', () => {
    const gate = createRequestGate(config({ globalCallsPerWindow: 2 }))
    for (const client of ['client-a', 'client-b']) {
      const decision = gate.acquire(client)
      if (decision.ok) decision.permit.release()
    }

    expect(gate.acquire('client-c')).toEqual({
      ok: false,
      retryAfterMs: 60_000,
    })
  })

  it('resets fixed windows and reports the remaining retry duration', () => {
    let now = 0
    const gate = createRequestGate(
      config({ clientCallsPerWindow: 1, clock: () => now }),
    )
    const first = gate.acquire('client-a')
    if (first.ok) first.permit.release()

    now = 59_000
    expect(gate.acquire('client-a')).toEqual({
      ok: false,
      retryAfterMs: 1_000,
    })
    now = 60_000
    expect(gate.acquire('client-a').ok).toBe(true)
  })

  it('evicts the least-recent client when the retained-key cap is reached', () => {
    let now = 0
    const gate = createRequestGate(
      config({
        clientCallsPerWindow: 1,
        maxClientKeys: 2,
        clock: () => now,
      }),
    )
    for (const client of ['client-a', 'client-b']) {
      const decision = gate.acquire(client)
      if (decision.ok) decision.permit.release()
      now += 1
    }
    const third = gate.acquire('client-c')
    if (third.ok) third.permit.release()

    expect(gate.acquire('client-a').ok).toBe(true)
  })

  it('supports release in finally when model work throws', async () => {
    const gate = createRequestGate(config({ maxConcurrency: 1 }))
    const decision = gate.acquire('client-a')
    if (!decision.ok) throw new Error('Expected a permit')

    await expect(
      (async () => {
        try {
          throw new Error('model failed')
        } finally {
          decision.permit.release()
        }
      })(),
    ).rejects.toThrow('model failed')
    expect(gate.acquire('client-b').ok).toBe(true)
  })

  it('fails closed on invalid gate configuration', () => {
    expect(() =>
      createRequestGate(config({ globalCallsPerWindow: 0 })),
    ).toThrow('Invalid request gate configuration: globalCallsPerWindow')
  })

  it('keeps the model-call factory and config aliases behaviorally compatible', () => {
    const genericConfig: RequestGateConfig = config({ maxConcurrency: 1 })
    const modelConfig: ModelCallGateConfig = genericConfig
    const generic = createRequestGate(genericConfig)
    const model = createModelCallGate(modelConfig)

    expect(generic.acquire('client-a').ok).toBe(true)
    expect(model.acquire('client-a').ok).toBe(true)
    expect(generic.acquire('client-b')).toEqual({
      ok: false,
      retryAfterMs: 1_000,
    })
    expect(model.acquire('client-b')).toEqual({
      ok: false,
      retryAfterMs: 1_000,
    })
  })

  it('keeps counters and permits separate across gate instances', () => {
    const first = createRequestGate(config({ maxConcurrency: 1 }))
    const second = createRequestGate(config({ maxConcurrency: 1 }))

    expect(first.acquire('client-a').ok).toBe(true)
    expect(first.acquire('client-b').ok).toBe(false)
    expect(second.acquire('client-b').ok).toBe(true)
  })
})

function config(
  overrides: Partial<RequestGateConfig> = {},
): RequestGateConfig {
  return {
    maxConcurrency: 10,
    globalCallsPerWindow: 10,
    clientCallsPerWindow: 10,
    windowMs: 60_000,
    maxClientKeys: 10,
    clock: () => 0,
    ...overrides,
  }
}
