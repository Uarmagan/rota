import { describe, expect, it, vi } from 'vitest'
import { ParserError, type IntentParser } from '../../../lib/parser/intent-parser'
import { createEmptyTripIntent, type ParseResult } from '../../../lib/schema/trip-intent'
import type { ModelCallGate } from '../../../lib/server/request-gate'
import { handleParse } from './route'

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

describe('handleParse', () => {
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

  it('rejects malformed JSON', async () => {
    const response = await handleParse(
      new Request('http://localhost/api/parse', {
        method: 'POST',
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
    expect(parse).toHaveBeenCalledWith(createEmptyTripIntent(), utterance)
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

function parseRequest(body: unknown): Request {
  return new Request('http://localhost/api/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
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
