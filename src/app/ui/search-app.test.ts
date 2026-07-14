// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceBatch } from '@/lib/availability/types'
import type { GapOutcome } from '@/lib/engine/gaps'
import type { FlightOption } from '@/lib/engine/types'
import type { TripIntent } from '@/lib/schema/trip-intent'
import { SearchApp } from './search-app'

const SEARCH_INTENT: TripIntent = {
  travelers: 2,
  origin: { iata: 'ORD', city: 'Chicago', assumed: true },
  destination: { iata: 'NRT', city: 'Tokyo' },
  cabin: 'economy',
  dates: {
    earliest: '2027-02-03',
    latest: '2027-02-03',
    flexibility: 'exact',
  },
  priority: null,
  constraints: {
    nonstop: null,
    arriveBy: null,
    departAfter: null,
    avoidRedeye: null,
    avoidLateArrival: null,
  },
}

const FIRST_OPTION: FlightOption = {
  id: 'meridian-001',
  source: 'meridian',
  cabin: 'economy',
  segments: [
    {
      from: 'ORD',
      to: 'NRT',
      departLocal: '2027-02-03T08:00',
      arriveLocal: '2027-02-03T11:00',
    },
  ],
  totalDurationMinutes: 900,
  pricing: { baseMiles: 80_000, feesUsd: 60, program: 'Meridian Rewards' },
}

const BETTER_OPTION: FlightOption = {
  id: 'aurora-001',
  source: 'aurora',
  cabin: 'economy',
  segments: [
    {
      from: 'ORD',
      to: 'NRT',
      departLocal: '2027-02-03T09:00',
      arriveLocal: '2027-02-03T10:00',
    },
  ],
  totalDurationMinutes: 600,
  pricing: { baseMiles: 40_000, feesUsd: 30, program: 'Aurora Premier' },
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SearchApp', () => {
  it('renders normalized chips and searches with the returned full intent', async () => {
    const router = new FetchRouter()
    router.parse.push(parseResponse(SEARCH_INTENT))
    router.search.push(sseResponse([doneFrame()]))
    router.install()

    await submitUtterance('tokyo in feb for 2')

    expect(await screen.findByText('ORD · Chicago')).toBeTruthy()
    expect(screen.getByText('NRT · Tokyo')).toBeTruthy()
    expect(screen.getByText('Feb 3, 2027')).toBeTruthy()
    expect(screen.getByText('economy')).toBeTruthy()
    expect(screen.queryByText('parsing…')).toBeNull()
    await waitFor(() => expect(router.requestsFor('/api/search')).toHaveLength(1))
    expect(searchIntentFrom(router.requestsFor('/api/search')[0].url)).toEqual(
      SEARCH_INTENT,
    )
  })

  it('restores an utterance and asks for a rephrase after a rejected parse', async () => {
    const router = new FetchRouter()
    router.parse.push(
      Response.json({ error: 'invalid_parser_output' }, { status: 422 }),
    )
    router.install()

    const input = await submitUtterance('tokio maybe')

    expect(
      await screen.findByText('I couldn’t turn that into a search. Mind rephrasing?'),
    ).toBeTruthy()
    expect(input.value).toBe('tokio maybe')
    expect(router.requestsFor('/api/search')).toHaveLength(0)
  })

  it('keeps a direct origin edit when an older parse resolves', async () => {
    const user = userEvent.setup()
    const router = new FetchRouter()
    const staleParse = deferred<Response>()
    router.parse.push(parseResponse(SEARCH_INTENT), staleParse.promise)
    router.search.push(sseResponse([doneFrame()]), sseResponse([doneFrame()]))
    router.install()

    const input = await submitUtterance('tokyo in feb for 2')
    await screen.findByText('ORD · Chicago')

    await user.type(input, 'actually business class{Enter}')
    await waitFor(() => expect(router.requestsFor('/api/parse')).toHaveLength(2))
    const staleRequest = router.requestsFor('/api/parse')[1]

    await user.click(screen.getByRole('button', { name: /from.*ORD · Chicago/i }))
    await user.click(screen.getByRole('button', { name: /San Francisco SFO/i }))
    expect(await screen.findByText('SFO · San Francisco')).toBeTruthy()
    await waitFor(() => expect(router.requestsFor('/api/search')).toHaveLength(2))

    staleParse.resolve(
      parseResponse({
        ...SEARCH_INTENT,
        cabin: 'business',
      }),
    )

    await waitFor(() => {
      expect(screen.queryByText('parsing…')).toBeNull()
    })
    expect(screen.getByText('SFO · San Francisco')).toBeTruthy()
    expect(screen.queryByText('ORD · Chicago')).toBeNull()
    expect(router.requestsFor('/api/search')).toHaveLength(2)
    expect(staleRequest.init?.signal?.aborted).toBe(true)
  })

  it('applies every direct editor family without calling the parser again', async () => {
    const user = userEvent.setup()
    const router = new FetchRouter()
    const editableIntent: TripIntent = {
      ...SEARCH_INTENT,
      priority: 'cheapest',
      constraints: {
        nonstop: 'preferred',
        arriveBy: '17:00',
        departAfter: '09:00',
        avoidRedeye: true,
        avoidLateArrival: false,
      },
    }
    router.parse.push(parseResponse(editableIntent))
    for (let index = 0; index < 12; index += 1) {
      router.search.push(sseResponse([doneFrame()]))
    }
    router.install()

    await submitUtterance('tokyo in feb for 2')
    await screen.findByText('ORD · Chicago')

    await user.click(screen.getByRole('button', { name: /travelers.*2/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Travelers' }), '3')
    await user.click(screen.getByRole('button', { name: /from.*ORD/i }))
    await user.click(screen.getByRole('button', { name: /San Francisco SFO/i }))
    await user.click(screen.getByRole('button', { name: /to.*NRT/i }))
    await user.click(screen.getByRole('button', { name: /Lisbon LIS/i }))
    await user.click(screen.getByRole('button', { name: /cabin.*economy/i }))
    await user.click(screen.getByRole('button', { name: 'business' }))
    await user.click(screen.getByRole('button', { name: /dates.*Feb 3/i }))
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2027-02-08')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /priority.*cheapest/i }))
    await user.click(screen.getByRole('button', { name: 'fastest' }))
    await user.click(screen.getByRole('button', { name: /nonstop.*preferred/i }))
    await user.click(screen.getByRole('button', { name: 'required' }))
    await user.click(screen.getByRole('button', { name: /arrive by.*17:00/i }))
    const arrive = screen.getByLabelText('Arrive by')
    await user.clear(arrive)
    await user.type(arrive, '19:30')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /depart after.*09:00/i }))
    const depart = screen.getByLabelText('Depart after')
    await user.clear(depart)
    await user.type(depart, '10:15')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await user.click(screen.getByRole('button', { name: /red-eyes.*avoid/i }))
    await user.click(screen.getByRole('button', { name: 'fine' }))
    await user.click(screen.getByRole('button', { name: /late arrival.*fine/i }))
    await user.click(screen.getByRole('button', { name: 'avoid' }))

    await waitFor(() => expect(router.requestsFor('/api/search')).toHaveLength(12))
    expect(router.requestsFor('/api/parse')).toHaveLength(1)
    expect(
      searchIntentFrom(router.requestsFor('/api/search').at(-1)!.url),
    ).toMatchObject({
      travelers: 3,
      origin: { iata: 'SFO', assumed: false },
      destination: { iata: 'LIS' },
      cabin: 'business',
      dates: {
        earliest: '2027-02-08',
        latest: '2027-02-08',
        flexibility: 'exact',
      },
      priority: 'fastest',
      constraints: {
        nonstop: 'required',
        arriveBy: '19:30',
        departAfter: '10:15',
        avoidRedeye: false,
        avoidLateArrival: true,
      },
    })
  })

  it('stops searching when dates or destination are cleared directly', async () => {
    const user = userEvent.setup()
    const router = new FetchRouter()
    router.parse.push(parseResponse(SEARCH_INTENT))
    router.search.push(sseResponse([doneFrame()]))
    router.install()

    await submitUtterance('tokyo in feb for 2')
    await screen.findByText('Feb 3, 2027')
    await user.click(screen.getByRole('button', { name: /dates.*Feb 3/i }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(await screen.findByText('When?')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /to.*NRT/i }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(await screen.findByText('Where to?')).toBeTruthy()
    expect(router.requestsFor('/api/search')).toHaveLength(1)
    expect(router.requestsFor('/api/parse')).toHaveLength(1)
  })

  it('clears a transient ready-with-notice outcome on a direct edit', async () => {
    const user = userEvent.setup()
    const router = new FetchRouter()
    router.parse.push(
      parseResponse(SEARCH_INTENT, {
        kind: 'ready_with_notice',
        unhandled: 'window seat',
      }),
    )
    router.search.push(sseResponse([doneFrame()]), sseResponse([doneFrame()]))
    router.install()

    await submitUtterance('tokyo with a window seat')
    expect(await screen.findByText(/window seat/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /cabin.*economy/i }))
    await user.click(screen.getByRole('button', { name: 'business' }))

    await waitFor(() => expect(screen.queryByText(/window seat/)).toBeNull())
    expect(router.requestsFor('/api/parse')).toHaveLength(1)
    expect(router.requestsFor('/api/search')).toHaveLength(2)
  })

  it('ignores an old parse rejection after a direct origin edit', async () => {
    const user = userEvent.setup()
    const router = new FetchRouter()
    const staleParse = deferred<Response>()
    router.parse.push(parseResponse(SEARCH_INTENT), staleParse.promise)
    router.search.push(sseResponse([doneFrame()]), sseResponse([doneFrame()]))
    router.install()

    const input = await submitUtterance('tokyo in feb for 2')
    await screen.findByText('ORD · Chicago')

    await user.type(input, 'actually business class{Enter}')
    await waitFor(() => expect(router.requestsFor('/api/parse')).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: /from.*ORD · Chicago/i }))
    await user.click(screen.getByRole('button', { name: /San Francisco SFO/i }))
    expect(await screen.findByText('SFO · San Francisco')).toBeTruthy()

    await act(async () => {
      staleParse.reject(new Error('request aborted'))
    })

    expect(input.value).toBe('')
    expect(
      screen.queryByText('Trouble reaching the parser. Try again in a moment.'),
    ).toBeNull()
    expect(screen.getByText('SFO · San Francisco')).toBeTruthy()
    expect(screen.queryByText('parsing…')).toBeNull()
  })

  it('aborts an active parse on unmount', async () => {
    const user = userEvent.setup()
    const router = new FetchRouter()
    const pendingParse = deferred<Response>()
    router.parse.push(pendingParse.promise)
    router.install()
    const { unmount } = render(createElement(SearchApp))
    const input = screen.getByRole('textbox') as HTMLInputElement

    await user.type(input, 'tokyo in feb for 2{Enter}')
    await waitFor(() => expect(router.requestsFor('/api/parse')).toHaveLength(1))
    const parseRequest = router.requestsFor('/api/parse')[0]

    unmount()

    expect(parseRequest.init?.signal?.aborted).toBe(true)
    await act(async () => {
      pendingParse.reject(new Error('request aborted'))
      await Promise.resolve()
    })
  })

  it('prompts for dates without starting a search', async () => {
    const router = new FetchRouter()
    router.parse.push(parseResponse({ ...SEARCH_INTENT, dates: null }))
    router.install()

    await submitUtterance('tokyo for 2')

    expect(await screen.findByText('When?')).toBeTruthy()
    expect(screen.getByText('Add dates to search. Try “in february”.')).toBeTruthy()
    expect(router.requestsFor('/api/search')).toHaveLength(0)
  })

  it('renders source batches progressively and moves the best-match badge', async () => {
    const router = new FetchRouter()
    const stream = new ControlledSearchResponse()
    router.parse.push(parseResponse(SEARCH_INTENT))
    router.search.push(stream.response)
    router.explain.push(Response.json({ text: 'The later option is the best match.' }))
    router.install()
    await submitUtterance('tokyo in feb for 2')

    await stream.send(batch('meridian', FIRST_OPTION))

    expect(await screen.findByText('08:00 → 11:00')).toBeTruthy()
    const firstBadge = screen.getByText('★ BEST')

    await stream.send(batch('aurora', BETTER_OPTION))

    expect(await screen.findByText('09:00 → 10:00')).toBeTruthy()
    expect(firstBadge.isConnected).toBe(false)
    expect(screen.getAllByText('★ BEST')).toHaveLength(1)
    await stream.finish()
  })

  it('shows a recovery message when the search stream drops', async () => {
    const router = new FetchRouter()
    const stream = new ControlledSearchResponse()
    router.parse.push(parseResponse(SEARCH_INTENT))
    router.search.push(stream.response)
    router.install()
    await submitUtterance('tokyo in feb for 2')

    await stream.fail(new Error('connection dropped'))

    expect(
      await screen.findByText('The search stream dropped. Try again.'),
    ).toBeTruthy()
  })

  it('requests one explanation and renders it only on the matching best option', async () => {
    const user = userEvent.setup()
    const router = new FetchRouter()
    const stream = new ControlledSearchResponse()
    const explanation = deferred<Response>()
    router.parse.push(parseResponse(SEARCH_INTENT))
    router.search.push(stream.response)
    router.explain.push(explanation.promise)
    router.install()
    await submitUtterance('tokyo in feb for 2')

    await stream.send(batch('meridian', FIRST_OPTION))
    await stream.send(batch('aurora', BETTER_OPTION))
    await stream.finish()
    await waitFor(() => expect(router.requestsFor('/api/explain')).toHaveLength(1))
    const explainRequest = router.requestsFor('/api/explain')[0]
    expect(JSON.parse(String(explainRequest.init?.body))).toMatchObject({
      facts: { optionId: BETTER_OPTION.id, isBestMatch: true },
    })

    explanation.resolve(Response.json({ text: 'Fastest option for this search.' }))

    await user.click(screen.getByRole('button', { name: /09:00.*10:00/i }))
    await screen.findByText('Fastest option for this search.')
    expect(screen.getAllByText('Fastest option for this search.')).toHaveLength(1)
  })

  it('completes the lazy-query, direct-edit, re-search, and result-details journey', async () => {
    const user = userEvent.setup()
    const router = new FetchRouter()
    const businessOption: FlightOption = {
      ...BETTER_OPTION,
      id: 'aurora-business-001',
      cabin: 'business',
    }
    router.parse.push(parseResponse(SEARCH_INTENT))
    router.search.push(
      sseResponse([batchFrame(batch('aurora', BETTER_OPTION)), doneFrame()]),
      sseResponse([batchFrame(batch('aurora', businessOption)), doneFrame()]),
    )
    router.explain.push(
      Response.json({ text: 'Initial why line.' }),
      Response.json({ text: 'Matching why line after the direct edit.' }),
    )
    router.install()

    await submitUtterance('tokyo in feb for 2')
    expect(await screen.findByText('ORD · Chicago')).toBeTruthy()
    expect(screen.getByText('assumed')).toBeTruthy()
    await waitFor(() => expect(router.requestsFor('/api/explain')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: /cabin.*economy/i }))
    await user.click(screen.getByRole('button', { name: 'business' }))
    await waitFor(() => expect(router.requestsFor('/api/search')).toHaveLength(2))
    await waitFor(() => expect(router.requestsFor('/api/explain')).toHaveLength(2))
    expect(router.requestsFor('/api/parse')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /09:00.*10:00/i }))
    expect(
      await screen.findByText('Matching why line after the direct edit.'),
    ).toBeTruthy()
  })
})

interface RecordedRequest {
  url: string
  init: RequestInit | undefined
}

class FetchRouter {
  readonly parse: Array<Response | Promise<Response>> = []
  readonly search: Array<Response | Promise<Response>> = []
  readonly explain: Array<Response | Promise<Response>> = []
  readonly requests: RecordedRequest[] = []

  install(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        this.requests.push({ url, init })
        const queue = url.startsWith('/api/parse')
          ? this.parse
          : url.startsWith('/api/search')
            ? this.search
            : url.startsWith('/api/explain')
              ? this.explain
              : null
        const response = queue?.shift()
        if (response === undefined) {
          throw new Error(`No queued response for ${url}`)
        }
        return response
      }),
    )
  }

  requestsFor(path: string): RecordedRequest[] {
    return this.requests.filter(({ url }) => url.startsWith(path))
  }
}

class ControlledSearchResponse {
  private controller!: ReadableStreamDefaultController<Uint8Array>
  readonly response = new Response(
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller
      },
    }),
  )

  async send(value: SourceBatch): Promise<void> {
    await act(async () => {
      this.controller.enqueue(encode(batchFrame(value)))
    })
  }

  async finish(): Promise<void> {
    await act(async () => {
      this.controller.enqueue(encode(doneFrame()))
      this.controller.close()
    })
  }

  async fail(error: Error): Promise<void> {
    await act(async () => {
      this.controller.error(error)
    })
  }
}

async function submitUtterance(utterance: string): Promise<HTMLInputElement> {
  const user = userEvent.setup()
  render(createElement(SearchApp))
  const input = screen.getByRole('textbox') as HTMLInputElement
  await user.type(input, `${utterance}{Enter}`)
  return input
}

function parseResponse(
  intent: TripIntent,
  gap: GapOutcome = { kind: 'ready' },
): Response {
  return Response.json({ intent, gap })
}

function batch(source: string, option: FlightOption): SourceBatch {
  return { source, batchIndex: 0, isFinal: true, options: [option] }
}

function batchFrame(value: SourceBatch): string {
  return `event: batch\ndata: ${JSON.stringify(value)}\n\n`
}

function doneFrame(): string {
  return 'event: done\ndata: {}\n\n'
}

function sseResponse(frames: readonly string[]): Response {
  return new Response(frames.join(''))
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function searchIntentFrom(url: string): unknown {
  const encoded = new URL(url, 'http://localhost').searchParams.get('intent')
  return JSON.parse(encoded ?? 'null')
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}
