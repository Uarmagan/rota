import { describe, expect, it } from 'vitest'
import { createSimulatedAvailability } from '../../../lib/availability/provider'
import { createEmptyTripIntent, type TripIntent } from '../../../lib/schema/trip-intent'
import { handleSearch } from './route'

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
})

function searchRequest(value: unknown): Request {
  const encoded = encodeURIComponent(JSON.stringify(value))
  return new Request(`http://localhost/api/search?intent=${encoded}`)
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
