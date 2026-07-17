import { DEMO_API_ERROR_CODES } from './demo-api-errors'
import type { PaidRequestLimitDecision } from './paid-request-limiter'

export const MAX_JSON_BODY_BYTES = 32 * 1024

export type LimitedJsonErrorReason =
  | 'malformed_json'
  | 'missing_body'
  | 'request_too_large'

export type LimitedJsonResult =
  | { ok: true; value: unknown }
  | {
      ok: false
      reason: LimitedJsonErrorReason
    }

export type JsonRequestResult =
  | { ok: true; value: unknown }
  | { ok: false; response: Response }

export async function readLimitedJson(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<LimitedJsonResult> {
  if (!request.body) return { ok: false, reason: 'missing_body' }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytesRead = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    if (bytesRead > maxBytes) {
      try {
        await reader.cancel()
      } catch {
        // The stable 413 response must not depend on a client stream's cancel hook.
      }
      return { ok: false, reason: 'request_too_large' }
    }
    chunks.push(value)
  }

  if (bytesRead === 0) return { ok: false, reason: 'missing_body' }

  const body = new Uint8Array(bytesRead)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(body)
    return { ok: true, value: JSON.parse(decoded) }
  } catch {
    return { ok: false, reason: 'malformed_json' }
  }
}

export async function readJsonRequest(
  request: Request,
): Promise<JsonRequestResult> {
  const body = await readLimitedJson(request)
  if (body.ok) return body
  return { ok: false, response: limitedJsonErrorResponse(body.reason) }
}

export function invalidRequest(detail: string): Response {
  return Response.json({ error: 'invalid_request', detail }, { status: 400 })
}

export function limitedJsonErrorResponse(
  reason: LimitedJsonErrorReason,
): Response {
  if (reason === 'request_too_large') {
    return Response.json({ error: reason }, { status: 413 })
  }
  return invalidRequest(
    reason === 'missing_body' ? 'Request body is required' : 'Malformed JSON',
  )
}

export function rateLimited(retryAfterMs?: number): Response {
  const headers =
    retryAfterMs === undefined
      ? undefined
      : {
          'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1_000))),
        }
  return Response.json(
    { error: DEMO_API_ERROR_CODES.rateLimited },
    {
      status: 429,
      headers,
    },
  )
}

export function paidRequestLimitError(
  decision: PaidRequestLimitDecision,
): Response | null {
  if (decision.status === 'allowed') return null
  if (decision.status === 'rate_limited') return rateLimited()
  return Response.json(
    { error: DEMO_API_ERROR_CODES.serviceUnavailable },
    { status: 503 },
  )
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
