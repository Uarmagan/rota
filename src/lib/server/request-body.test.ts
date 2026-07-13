import { describe, expect, it, vi } from 'vitest'
import { MAX_JSON_BODY_BYTES, readLimitedJson } from './request-body'

describe('readLimitedJson', () => {
  it('accepts a valid JSON body at the byte limit', async () => {
    const prefix = '{"value":"'
    const suffix = '"}'
    const valueLength = MAX_JSON_BODY_BYTES - prefix.length - suffix.length
    const body = `${prefix}${'x'.repeat(valueLength)}${suffix}`

    const result = await readLimitedJson(jsonRequest(body))

    expect(result).toEqual({
      ok: true,
      value: { value: 'x'.repeat(valueLength) },
    })
  })

  it('rejects and cancels a body one byte over the limit', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_JSON_BODY_BYTES))
        controller.enqueue(new Uint8Array(1))
      },
      cancel,
    })

    const result = await readLimitedJson(streamRequest(stream))

    expect(result).toEqual({ ok: false, reason: 'request_too_large' })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('distinguishes a missing body from malformed JSON', async () => {
    const missing = await readLimitedJson(
      new Request('http://localhost/api/test', { method: 'POST' }),
    )
    const malformed = await readLimitedJson(jsonRequest('{'))

    expect(missing).toEqual({ ok: false, reason: 'missing_body' })
    expect(malformed).toEqual({ ok: false, reason: 'malformed_json' })
  })

  it('parses chunked input without a Content-Length header', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"value":'))
        controller.enqueue(encoder.encode('"chunked"}'))
        controller.close()
      },
    })
    const request = streamRequest(stream)

    const result = await readLimitedJson(request)

    expect(request.headers.has('content-length')).toBe(false)
    expect(result).toEqual({ ok: true, value: { value: 'chunked' } })
  })
})

function jsonRequest(body: BodyInit): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    body,
  })
}

function streamRequest(body: ReadableStream<Uint8Array>): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}
