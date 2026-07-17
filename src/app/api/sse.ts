import type { SourceBatch } from '../../lib/availability/types'

const encoder = new TextEncoder()

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function sourceBatchStream(
  batches: AsyncIterable<SourceBatch>,
  signal: AbortSignal,
  cancelUpstream: () => void = () => {},
): Response {
  const iterator = batches[Symbol.asyncIterator]()
  let ended = false

  const stop = async (): Promise<void> => {
    if (ended) return
    ended = true
    cancelUpstream()
    await iterator.return?.()
  }
  signal.addEventListener('abort', () => void stop(), { once: true })

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (ended || signal.aborted) {
        await stop()
        controller.close()
        return
      }
      const next = await iterator.next()
      if (ended || signal.aborted) {
        controller.close()
        return
      }
      if (next.done) {
        ended = true
        controller.enqueue(encoder.encode(sseEvent('done', {})))
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(sseEvent('batch', next.value)))
    },
    async cancel() {
      await stop()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
