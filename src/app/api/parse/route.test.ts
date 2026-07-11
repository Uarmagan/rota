import { describe, expect, it } from 'vitest'
import { ParserError, type IntentParser } from '../../../lib/parser/intent-parser'
import { createEmptyTripIntent, type ParseResult } from '../../../lib/schema/trip-intent'
import { handleParse } from './route'

const parsedIntent: ParseResult['intent'] = {
  ...createEmptyTripIntent(),
  destination: { iata: 'NRT', city: 'Tokyo, Japan' },
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
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      intent: {
        travelers: 2,
        origin: { iata: 'ORD', city: 'Chicago', assumed: true },
        destination: { iata: 'NRT', city: 'Tokyo' },
        cabin: 'economy',
      },
      gap: { kind: 'ready' },
    })
  })

  it('returns a targeted follow-up for a missing destination', async () => {
    const response = await handleParse(
      validRequest(),
      stubParser({ intent: createEmptyTripIntent(), unhandled: null }),
    )

    expect(await response.json()).toMatchObject({
      gap: {
        kind: 'follow_up',
        reason: 'missing_destination',
        question: 'Where do you want to fly to?',
      },
    })
  })

  it('returns a notice for a searchable unhandled clause', async () => {
    const response = await handleParse(
      validRequest(),
      stubParser({ intent: parsedIntent, unhandled: 'window seat' }),
    )

    expect(await response.json()).toMatchObject({
      gap: { kind: 'ready_with_notice', unhandled: 'window seat' },
    })
  })

  it('absorbs an unhandled clause into a missing-destination follow-up', async () => {
    const response = await handleParse(
      validRequest(),
      stubParser({ intent: createEmptyTripIntent(), unhandled: 'somewhere warm' }),
    )

    expect(await response.json()).toMatchObject({
      gap: {
        kind: 'follow_up',
        question:
          'I couldn\'t use "somewhere warm" — and I still need a destination. Where would you like to fly?',
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

    const response = await handleParse(validRequest(), parser)

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: reason })
  })

  it('rejects malformed JSON', async () => {
    const response = await handleParse(
      new Request('http://localhost/api/parse', {
        method: 'POST',
        body: '{',
      }),
      stubParser({ intent: parsedIntent, unhandled: null }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_request' })
  })

  it('rejects an empty utterance', async () => {
    const response = await handleParse(
      parseRequest({ currentIntent: createEmptyTripIntent(), utterance: '' }),
      stubParser({ intent: parsedIntent, unhandled: null }),
    )

    expect(response.status).toBe(400)
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
