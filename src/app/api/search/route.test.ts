import { describe, expect, it, vi } from 'vitest'
import { createSimulatedAvailability } from '../../../lib/availability/provider'
import type { AvailabilityProvider } from '../../../lib/availability/types'
import { createEmptyTripIntent, type TripIntent } from '../../../lib/schema/trip-intent'
import {
  createRequestGate,
  type RequestGate,
} from '../../../lib/server/request-gate'
import { handleSearch as handleSearchRoute } from './route'

const intent: TripIntent = {
  ...createEmptyTripIntent(),
  travelers: 2,
  origin: { iata: 'ORD', city: 'Chicago', assumed: true },
  destination: { iata: 'NRT', city: 'Tokyo', assumed: false },
  cabin: 'business',
  dates: {
    earliest: '2027-02-01',
    latest: '2027-02-28',
    flexibility: 'flexible',
  },
}

const instantProvider = () =>
  createSimulatedAvailability({ delay: () => Promise.resolve() })

const allowingGate: RequestGate = {
  acquire: () => ({ ok: true, permit: { release() {} } }),
}

function handleSearch(
  request: Request,
  provider: AvailabilityProvider,
  gate: RequestGate = allowingGate,
  trustForwardedAddress = false,
): Response {
  return handleSearchRoute(request, provider, gate, trustForwardedAddress)
}

describe('handleSearch', () => {
  it('streams complete sequential batches and a terminal done event', async () => {
    const response = handleSearch(searchRequest(intent), instantProvider())
    const events = parseEvents(await response.text())

    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const batches = events
      .filter(({ event }) => event === 'batch')
      .map(({ data }) => data as { source: string; batchIndex: number; isFinal: boolean })
    expect(new Set(batches.map(({ source }) => source))).toEqual(
      new Set(['meridian', 'aurora', 'zephyr', 'vantage']),
    )
    for (const source of new Set(batches.map(({ source }) => source))) {
      const sourceBatches = batches.filter((batch) => batch.source === source)
      expect(sourceBatches.map(({ batchIndex }) => batchIndex)).toEqual(
        sourceBatches.map((_, index) => index),
      )
      expect(sourceBatches.filter(({ isFinal }) => isFinal)).toHaveLength(1)
      expect(sourceBatches.at(-1)?.isFinal).toBe(true)
    }
    expect(events.at(-1)).toEqual({ event: 'done', data: {} })
  })

  it('produces byte-identical event payloads across runs', async () => {
    const first = await handleSearch(searchRequest(intent), instantProvider()).text()
    const second = await handleSearch(searchRequest(intent), instantProvider()).text()

    expect(second).toBe(first)
  })

  it.each([
    ['a missing intent', new Request('http://localhost/api/search')],
    ['malformed JSON', new Request('http://localhost/api/search?intent=%7B')],
    [
      'a schema-invalid intent',
      searchRequest({ ...intent, travelers: 20 }),
    ],
  ])('rejects %s', async (_case, request) => {
    const response = handleSearch(request, instantProvider())

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_request' })
  })

  it('rejects a non-searchable intent', async () => {
    const response = handleSearch(
      searchRequest({ ...intent, destination: null }),
      instantProvider(),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'not_searchable' })
  })

  it('rejects cross-site requests before parsing, gate work, or provider work', async () => {
    const acquire = vi.fn<RequestGate['acquire']>()
    const search = vi.fn<AvailabilityProvider['search']>()
    const response = handleSearch(
      new Request('http://localhost/api/search?intent=%7B', {
        headers: { origin: 'https://attacker.example' },
      }),
      { search },
      { acquire },
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'cross_site_request' })
    expect(acquire).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })

  it.each([
    ['schema-invalid intent', { ...intent, travelers: 20 }],
    ['non-searchable intent', { ...intent, destination: null }],
  ])('does not acquire or call the provider for %s', async (_name, value) => {
    const acquire = vi.fn<RequestGate['acquire']>()
    const search = vi.fn<AvailabilityProvider['search']>()
    const response = handleSearch(
      searchRequest(value),
      { search },
      { acquire },
    )

    expect(response.status).toBe(400)
    expect(acquire).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })

  it('uses the shared trusted-address decision when deriving the search key', async () => {
    const acquire = vi.fn<RequestGate['acquire']>(() => ({
      ok: false,
      retryAfterMs: 1_000,
    }))
    handleSearch(
      searchRequest(intent, { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }),
      instantProvider(),
      { acquire },
      true,
    )

    expect(acquire).toHaveBeenCalledWith('forwarded:203.0.113.9')
  })

  it('returns a stable 429 without calling the provider when admission rejects', async () => {
    const search = vi.fn<AvailabilityProvider['search']>()
    const response = handleSearch(
      searchRequest(intent),
      { search },
      { acquire: () => ({ ok: false, retryAfterMs: 2_001 }) },
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('3')
    expect(await response.json()).toEqual({ error: 'rate_limited' })
    expect(search).not.toHaveBeenCalled()
  })

  it('releases the permit once after natural completion', async () => {
    const release = vi.fn()
    const response = handleSearch(
      searchRequest(intent),
      instantProvider(),
      { acquire: () => ({ ok: true, permit: { release } }) },
    )

    await response.text()

    expect(release).toHaveBeenCalledOnce()
  })

  it('aborts provider work and releases once on direct stream cancellation', async () => {
    let providerSignal: AbortSignal | undefined
    const release = vi.fn()
    const provider: AvailabilityProvider = {
      search: (_query, signal) => {
        providerSignal = signal
        return blockedBatches(signal)
      },
    }
    const response = handleSearch(
      searchRequest(intent),
      provider,
      { acquire: () => ({ ok: true, permit: { release } }) },
    )

    await response.body?.cancel()

    expect(providerSignal).toBeDefined()
    expect(providerSignal?.aborted).toBe(true)
    expect(release).toHaveBeenCalledOnce()
  })

  it('releases after request abort so a one-slot gate reacquires immediately', async () => {
    const controller = new AbortController()
    const gate = createRequestGate({
      maxConcurrency: 1,
      globalCallsPerWindow: 10,
      clientCallsPerWindow: 10,
      windowMs: 60_000,
      maxClientKeys: 10,
    })
    const provider: AvailabilityProvider = {
      search: (_query, signal) => blockedBatches(signal),
    }
    const first = handleSearch(
      searchRequest(intent, {}, controller.signal),
      provider,
      gate,
    )

    expect(handleSearch(searchRequest(intent), provider, gate).status).toBe(429)
    controller.abort()
    await vi.waitFor(() => {
      expect(handleSearch(searchRequest(intent), instantProvider(), gate).status).toBe(200)
    })
    await first.body?.cancel()
  })

  it('releases the permit exactly once on request abort', async () => {
    const controller = new AbortController()
    const release = vi.fn()
    const response = handleSearch(
      searchRequest(intent, {}, controller.signal),
      { search: (_query, signal) => blockedBatches(signal) },
      { acquire: () => ({ ok: true, permit: { release } }) },
    )

    controller.abort()
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce())
    await response.body?.cancel()

    expect(release).toHaveBeenCalledOnce()
  })

  it('releases once when the provider fails during streaming', async () => {
    const release = vi.fn()
    const provider: AvailabilityProvider = {
      search: () => failingBatches(),
    }
    const response = handleSearch(
      searchRequest(intent),
      provider,
      { acquire: () => ({ ok: true, permit: { release } }) },
    )

    await expect(response.text()).rejects.toThrow('provider failed')
    expect(release).toHaveBeenCalledOnce()
  })

  it('releases once and preserves the stable error when provider setup throws', async () => {
    const release = vi.fn()
    const provider: AvailabilityProvider = {
      search: () => {
        throw new Error('setup failed')
      },
    }

    const response = handleSearch(
      searchRequest(intent),
      provider,
      { acquire: () => ({ ok: true, permit: { release } }) },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'not_searchable' })
    expect(release).toHaveBeenCalledOnce()
  })
})

function searchRequest(
  value: unknown,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Request {
  const encoded = encodeURIComponent(JSON.stringify(value))
  return new Request(`http://localhost/api/search?intent=${encoded}`, {
    headers,
    signal,
  })
}

async function* blockedBatches(signal: AbortSignal): AsyncGenerator<never> {
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

async function* failingBatches(): AsyncGenerator<never> {
  throw new Error('provider failed')
}

function parseEvents(text: string): Array<{ event: string; data: unknown }> {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const [eventLine, dataLine] = block.split('\n')
      return {
        event: eventLine.slice('event: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)),
      }
    })
}
