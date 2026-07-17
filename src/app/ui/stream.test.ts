import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceBatch } from '@/lib/availability/types'
import type { TripIntent } from '@/lib/schema/trip-intent'
import { SearchStreamError, searchStream } from './stream'

const intent: TripIntent = {
  travelers: null,
  origin: null,
  destination: null,
  cabin: null,
  dates: null,
  priority: null,
  constraints: {
    nonstop: null,
    arriveBy: null,
    departAfter: null,
    avoidRedeye: null,
    avoidLateArrival: null,
  },
}

const firstBatch: SourceBatch = {
  source: 'meridian',
  batchIndex: 0,
  isFinal: false,
  options: [],
}

const finalBatch: SourceBatch = {
  source: 'meridian',
  batchIndex: 1,
  isFinal: true,
  options: [],
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('searchStream', () => {
  it('yields multiple batch frames from one response chunk and stops at done', async () => {
    stubFetchWithChunks([
      `${frame('batch', firstBatch)}${frame('batch', finalBatch)}${frame('done', {})}`,
    ])

    expect(await collect(searchStream(intent, new AbortController().signal))).toEqual([
      firstBatch,
      finalBatch,
    ])
  })

  it('buffers a frame split across arbitrary response chunks', async () => {
    const payload = `${frame('batch', firstBatch)}${frame('done', {})}`
    stubFetchWithChunks([
      payload.slice(0, 3),
      payload.slice(3, 17),
      payload.slice(17, 31),
      payload.slice(31),
    ])

    expect(await collect(searchStream(intent, new AbortController().signal))).toEqual([
      firstBatch,
    ])
  })

  it('rejects a non-successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    const error = await collect(
      searchStream(intent, new AbortController().signal),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(SearchStreamError)
    expect(error).toMatchObject({ status: 503, message: 'Search failed (503)' })
  })

  it('carries an empty-body 429 as a typed status-only outcome', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 429 })))

    const error = await collect(
      searchStream(intent, new AbortController().signal),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(SearchStreamError)
    expect(error).toMatchObject({ status: 429, message: 'Search failed (429)' })
  })

  it('rejects a response without a body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, body: null } as Response),
    )

    await expect(
      collect(searchStream(intent, new AbortController().signal)),
    ).rejects.toThrow('Search failed (200)')
  })

  it('releases the response reader when the search is aborted', async () => {
    const controller = new AbortController()
    let streamController: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(nextController) {
        streamController = nextController
        nextController.enqueue(new TextEncoder().encode(frame('batch', firstBatch)))
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
        init?.signal?.addEventListener('abort', () => {
          streamController.error(new DOMException('Aborted', 'AbortError'))
        })
        return new Response(body)
      }),
    )

    const batches = searchStream(intent, controller.signal)
    expect((await batches.next()).value).toEqual(firstBatch)

    controller.abort()

    await expect(batches.next()).rejects.toThrow()
    expect(body.locked).toBe(false)
  })
})

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function stubFetchWithChunks(chunks: readonly string[]): void {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      controller.close()
    },
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)))
}

async function collect(
  batches: AsyncGenerator<SourceBatch, void>,
): Promise<SourceBatch[]> {
  const collected: SourceBatch[] = []
  for await (const batch of batches) collected.push(batch)
  return collected
}
