import type { SourceBatch } from '../../lib/availability/types'
import type { TripIntent } from '../../lib/schema/trip-intent'

// Client side of GET /api/search: fetch-reader SSE parsing (EventSource can't
// be aborted per-search as cleanly, and we already re-open per refinement).
export async function* searchStream(
  intent: TripIntent,
  signal: AbortSignal,
): AsyncGenerator<SourceBatch, void> {
  const response = await fetch(
    `/api/search?intent=${encodeURIComponent(JSON.stringify(intent))}`,
    { signal, headers: { accept: 'text/event-stream' } },
  )
  if (!response.ok || response.body === null) {
    throw new Error(`Search failed (${response.status})`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let end: number
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const event = frame.match(/^event: (.+)$/m)?.[1]
        const data = frame.match(/^data: (.+)$/m)?.[1]
        if (event === 'done') return
        if (event === 'batch' && data !== undefined) {
          yield JSON.parse(data) as SourceBatch
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
