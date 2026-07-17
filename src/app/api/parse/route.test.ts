import { describe, expect, it, vi } from 'vitest'
import { ParserError, type IntentParser } from '../../../lib/parser/intent-parser'
import { createEmptyTripIntent, type ParseResult } from '../../../lib/schema/trip-intent'
import type { PaidRequestLimiter } from '../../../lib/server/paid-request-limiter'
import type { ModelCallGate } from '../../../lib/server/request-gate'
import { handleParse as handleParseRoute } from './route'

const parsedIntent: ParseResult['intent'] = {
  ...createEmptyTripIntent(),
  destination: { iata: 'NRT', city: 'Tokyo, Japan', assumed: false },
  travelers: 2,
  dates: {
    earliest: '2027-02-01',
    latest: '2027-02-28',
    flexibility: 'flexible',
  },
}

function handleParse(
  request: Request,
  parser: IntentParser,
  gate: ModelCallGate,
  limiter: PaidRequestLimiter = allowingPaidRequestLimiter,
  trustForwardedAddress = false,
): Promise<Response> {
  return handleParseRoute(
    request,
    parser,
    gate,
    limiter,
    trustForwardedAddress,
  )
}

describe('handleParse', () => {
  it('rejects non-JSON media before acquiring a permit or parsing', async () => {
    const parse = vi.fn<IntentParser['parse']>()
    const acquire = vi.fn<ModelCallGate['acquire']>()
    const response = await handleParse(
      new Request('http://localhost/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      }),
      { parse },
      { acquire },
    )

    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({
      error: 'unsupported_media_type',
    })
    expect(acquire).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
  })

  it('rejects cross-site JSON before acquiring a permit or parsing', async () => {
    const parse = vi.fn<IntentParser['parse']>()
    const acquire = vi.fn<ModelCallGate['acquire']>()
    const response = await handleParse(
      parseRequest(
        {
          currentIntent: createEmptyTripIntent(),
          utterance: 'to tokyo',
        },
        { origin: 'https://attacker.example' },
      ),
      { parse },
      { acquire },
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'cross_site_request' })
    expect(acquire).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
  })

  it('rejects without reading a throwing request stream', async () => {
    const parse = vi.fn<IntentParser['parse']>()
    const acquire = vi.fn<ModelCallGate['acquire']>()
    const response = await handleParse(
      throwingStreamRequest('http://localhost/api/parse'),
      { parse },
      { acquire },
    )

    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({
      error: 'unsupported_media_type',
    })
    expect(acquire).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
  })

  it('accepts same-origin JSON browser requests', async () => {
    const response = await handleParse(
      parseRequest(
        {
          currentIntent: createEmptyTripIntent(),
          utterance: 'to tokyo',
        },
        {
          origin: 'http://localhost',
          'sec-fetch-site': 'same-origin',
        },
      ),
      stubParser({ intent: parsedIntent, unhandled: null }),
      allowingGate,
    )

    expect(response.status).toBe(200)
  })

  it('normalizes a successful lazy utterance', async () => {
    const response = await handleParse(
      parseRequest({
        currentIntent: createEmptyTripIntent(),
        utterance: 'tokyo in feb for 2',
      }),
      stubParser({ intent: parsedIntent, unhandled: null }),
      allowingGate,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      intent: {
        travelers: 2,
        origin: { iata: 'ORD', city: 'Chicago', assumed: true },
        destination: { iata: 'NRT', city: 'Tokyo', assumed: false },
        cabin: 'economy',
      },
      gap: { kind: 'ready' },
    })
  })

  it('passes the exact request signal and releases the permit on success', async () => {
    const parse = vi.fn(async () => ({ intent: parsedIntent, unhandled: null }))
    const release = vi.fn()
    const gate: ModelCallGate = {
      acquire: () => ({ ok: true, permit: { release } }),
    }
    const request = validRequest()

    const response = await handleParse(request, { parse }, gate)

    expect(response.status).toBe(200)
    expect(parse).toHaveBeenCalledWith(
      createEmptyTripIntent(),
      'to tokyo',
      request.signal,
    )
    expect(release).toHaveBeenCalledOnce()
  })

  it('resolves a country destination as an immediately searchable assumption', async () => {
    const response = await handleParse(
      validRequest(),
      stubParser({
        intent: {
          ...createEmptyTripIntent(),
          destination: { country: 'Japan' },
          dates: {
            earliest: '2026-10-01',
            latest: '2026-10-31',
            flexibility: 'flexible',
          },
        },
        unhandled: null,
      }),
      allowingGate,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      intent: {
        origin: { iata: 'ORD', city: 'Chicago', assumed: true },
        destination: { iata: 'NRT', city: 'Tokyo', assumed: true },
      },
      gap: { kind: 'ready' },
    })
  })

  it('returns a targeted follow-up for a missing destination', async () => {
    const response = await handleParse(
      validRequest(),
      stubParser({ intent: createEmptyTripIntent(), unhandled: null }),
      allowingGate,
    )

    expect(await response.json()).toMatchObject({
      gap: {
        kind: 'follow_up',
        reason: 'missing_destination',
        unhandled: null,
      },
    })
  })

  it('returns a notice for a searchable unhandled clause', async () => {
    const response = await handleParse(
      validRequest(),
      stubParser({ intent: parsedIntent, unhandled: 'window seat' }),
      allowingGate,
    )

    expect(await response.json()).toMatchObject({
      gap: { kind: 'ready_with_notice', unhandled: 'window seat' },
    })
  })

  it('absorbs an unhandled clause into a missing-destination follow-up', async () => {
    const response = await handleParse(
      validRequest(),
      stubParser({ intent: createEmptyTripIntent(), unhandled: 'somewhere warm' }),
      allowingGate,
    )

    expect(await response.json()).toMatchObject({
      gap: {
        kind: 'follow_up',
        reason: 'missing_destination',
        unhandled: 'somewhere warm',
      },
    })
  })

  it.each([
    ['invalid_output', 422],
    ['transport', 502],
  ] as const)('maps %s parser errors to %i', async (reason, status) => {
    const parser: IntentParser = {
      parse: async () => {
        throw new ParserError(reason, 'failed')
      },
    }

    const response = await handleParse(validRequest(), parser, allowingGate)

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: reason })
  })

  it('reports an exhausted demo budget without presenting it as an outage', async () => {
    const parser: IntentParser = {
      parse: async () => {
        throw new ParserError('budget_exhausted', 'OpenAI quota exhausted')
      },
    }

    const response = await handleParse(validRequest(), parser, allowingGate)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'demo_budget_exhausted',
    })
  })

  it('releases the model-call permit when the parser throws', async () => {
    const release = vi.fn()
    const gate: ModelCallGate = {
      acquire: () => ({ ok: true, permit: { release } }),
    }
    const parser: IntentParser = {
      parse: async () => {
        throw new Error('unexpected failure')
      },
    }

    await expect(handleParse(validRequest(), parser, gate)).rejects.toThrow(
      'unexpected failure',
    )
    expect(release).toHaveBeenCalledOnce()
  })

  it('releases the model-call permit once when the request aborts', async () => {
    const controller = new AbortController()
    const request = parseRequest(
      {
        currentIntent: createEmptyTripIntent(),
        utterance: 'to tokyo',
      },
      controller.signal,
    )
    const release = vi.fn()
    const gate: ModelCallGate = {
      acquire: () => ({ ok: true, permit: { release } }),
    }
    const parse = vi.fn<IntentParser['parse']>(async (_intent, _utterance, signal) => {
      await rejectWhenAborted(signal)
      throw new Error('request aborted')
    })

    const response = handleParse(request, { parse }, gate)
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce())
    controller.abort()

    await expect(response).rejects.toThrow('request aborted')
    expect(parse).toHaveBeenCalledWith(
      createEmptyTripIntent(),
      'to tokyo',
      request.signal,
    )
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects malformed JSON', async () => {
    const response = await handleParse(
      new Request('http://localhost/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      stubParser({ intent: parsedIntent, unhandled: null }),
      allowingGate,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_request' })
  })

  it('rejects an oversized body before calling the parser', async () => {
    const parse = vi.fn<IntentParser['parse']>()
    const response = await handleParse(
      new Request('http://localhost/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: 'x'.repeat(32 * 1024) }),
      }),
      { parse },
      allowingGate,
    )

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'request_too_large' })
    expect(parse).not.toHaveBeenCalled()
  })

  it('returns 429 without parsing when the model-call gate rejects', async () => {
    const parse = vi.fn<IntentParser['parse']>()
    const response = await handleParse(validRequest(), { parse }, rejectingGate)

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('3')
    expect(await response.json()).toEqual({ error: 'rate_limited' })
    expect(parse).not.toHaveBeenCalled()
  })

  it('returns a shared 429 and releases the local permit before parsing', async () => {
    const parse = vi.fn<IntentParser['parse']>()
    const release = vi.fn()
    const gate: ModelCallGate = {
      acquire: () => ({ ok: true, permit: { release } }),
    }
    const check = vi.fn<PaidRequestLimiter['check']>().mockResolvedValue({
      status: 'rate_limited',
    })

    const response = await handleParse(
      validRequest(),
      { parse },
      gate,
      { check },
    )

    expect(response.status).toBe(429)
    expect(response.headers.has('retry-after')).toBe(false)
    expect(await response.json()).toEqual({ error: 'rate_limited' })
    expect(check).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
    expect(parse).not.toHaveBeenCalled()
  })

  it('returns a detail-free 503 and releases the permit when the shared limiter is unavailable', async () => {
    const parse = vi.fn<IntentParser['parse']>()
    const release = vi.fn()
    const check = vi.fn<PaidRequestLimiter['check']>().mockResolvedValue({
      status: 'unavailable',
    })

    const response = await handleParse(
      validRequest(),
      { parse },
      { acquire: () => ({ ok: true, permit: { release } }) },
      { check },
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'service_unavailable' })
    expect(check).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
    expect(parse).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'browser boundary rejection',
      request: () =>
        new Request('http://localhost/api/parse', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: '{}',
        }),
      locallyRejected: false,
    },
    {
      name: 'cross-site boundary rejection',
      request: () =>
        parseRequest(
          {
            currentIntent: createEmptyTripIntent(),
            utterance: 'to tokyo',
          },
          { origin: 'https://attacker.example' },
        ),
      locallyRejected: false,
    },
    {
      name: 'malformed body rejection',
      request: () =>
        new Request('http://localhost/api/parse', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
      locallyRejected: false,
    },
    {
      name: 'oversized body rejection',
      request: () =>
        new Request('http://localhost/api/parse', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: 'x'.repeat(32 * 1024) }),
        }),
      locallyRejected: false,
    },
    {
      name: 'schema rejection',
      request: () => parseRequest({ currentIntent: {}, utterance: '' }),
      locallyRejected: false,
    },
    {
      name: 'local gate rejection',
      request: validRequest,
      locallyRejected: true,
    },
  ])('skips the shared allowance on $name', async ({ request, locallyRejected }) => {
    const parse = vi.fn<IntentParser['parse']>()
    const check = vi.fn<PaidRequestLimiter['check']>()
    const acquire = vi.fn<ModelCallGate['acquire']>(() =>
      locallyRejected
        ? { ok: false, retryAfterMs: 1_000 }
        : { ok: true, permit: { release() {} } },
    )

    await handleParse(request(), { parse }, { acquire }, { check })

    expect(check).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
    expect(acquire).toHaveBeenCalledTimes(locallyRejected ? 1 : 0)
  })

  it('checks the shared allowance once and releases once on success', async () => {
    const parse = vi.fn(async () => ({ intent: parsedIntent, unhandled: null }))
    const check = vi.fn<PaidRequestLimiter['check']>().mockResolvedValue({
      status: 'allowed',
    })
    const release = vi.fn()

    const response = await handleParse(
      validRequest(),
      { parse },
      { acquire: () => ({ ok: true, permit: { release } }) },
      { check },
    )

    expect(response.status).toBe(200)
    expect(check).toHaveBeenCalledOnce()
    expect(parse).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects an empty utterance', async () => {
    const response = await handleParse(
      parseRequest({ currentIntent: createEmptyTripIntent(), utterance: '' }),
      stubParser({ intent: parsedIntent, unhandled: null }),
      allowingGate,
    )

    expect(response.status).toBe(400)
  })

  it('rejects an utterance over 500 Unicode code points before parsing', async () => {
    const parse = vi.fn<IntentParser['parse']>()
    const response = await handleParse(
      parseRequest({
        currentIntent: createEmptyTripIntent(),
        utterance: '🚀'.repeat(501),
      }),
      { parse },
      allowingGate,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_request' })
    expect(parse).not.toHaveBeenCalled()
  })

  it('trims and accepts an utterance of exactly 500 Unicode code points', async () => {
    const parse = vi.fn(async () => ({ intent: parsedIntent, unhandled: null }))
    const utterance = '🚀'.repeat(500)

    const response = await handleParse(
      parseRequest({
        currentIntent: createEmptyTripIntent(),
        utterance: `  ${utterance}  `,
      }),
      { parse },
      allowingGate,
    )

    expect(response.status).toBe(200)
    expect(parse).toHaveBeenCalledWith(
      createEmptyTripIntent(),
      utterance,
      expect.any(AbortSignal),
    )
  })

  it('accepts a current-intent city of exactly 100 Unicode code points', async () => {
    const parse = vi.fn(async () => ({ intent: parsedIntent, unhandled: null }))
    const currentIntent = {
      ...createEmptyTripIntent(),
      destination: {
        iata: 'NRT',
        city: '🚀'.repeat(100),
        assumed: false,
      },
    }

    const response = await handleParse(
      parseRequest({ currentIntent, utterance: 'keep it' }),
      { parse },
      allowingGate,
    )

    expect(response.status).toBe(200)
    expect(parse).toHaveBeenCalledOnce()
  })

  it('rejects a current-intent city over 100 Unicode code points', async () => {
    const parse = vi.fn<IntentParser['parse']>()
    const currentIntent = {
      ...createEmptyTripIntent(),
      destination: {
        iata: 'NRT',
        city: '🚀'.repeat(101),
        assumed: false,
      },
    }

    const response = await handleParse(
      parseRequest({ currentIntent, utterance: 'keep it' }),
      { parse },
      allowingGate,
    )

    expect(response.status).toBe(400)
    expect(parse).not.toHaveBeenCalled()
  })
})

function validRequest(): Request {
  return parseRequest({
    currentIntent: createEmptyTripIntent(),
    utterance: 'to tokyo',
  })
}

function parseRequest(
  body: unknown,
  headersOrSignal: Record<string, string> | AbortSignal = {},
): Request {
  const headers = headersOrSignal instanceof AbortSignal ? {} : headersOrSignal
  const signal = headersOrSignal instanceof AbortSignal ? headersOrSignal : undefined
  return new Request('http://localhost/api/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  })
}

function rejectWhenAborted(signal: AbortSignal | undefined): Promise<never> {
  if (!signal) throw new Error('missing request signal')
  if (signal.aborted) return Promise.reject(new Error('request aborted'))
  return new Promise((_, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new Error('request aborted')),
      { once: true },
    )
  })
}

function throwingStreamRequest(url: string): Request {
  const body = new ReadableStream<Uint8Array>({
    pull() {
      throw new Error('request body must not be read')
    },
  })
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

function stubParser(result: ParseResult): IntentParser {
  return { parse: async () => result }
}

const rejectingGate: ModelCallGate = {
  acquire: () => ({ ok: false, retryAfterMs: 2_001 }),
}

const allowingGate: ModelCallGate = {
  acquire: () => ({ ok: true, permit: { release() {} } }),
}

const allowingPaidRequestLimiter: PaidRequestLimiter = {
  check: async () => ({ status: 'allowed' }),
}
