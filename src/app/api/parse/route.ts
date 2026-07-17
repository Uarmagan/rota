import { checkGaps } from '../../../lib/engine/gaps'
import {
  canonicalizePlaces,
  fillAssumptions,
  fillDefaults,
} from '../../../lib/engine/normalize'
import { ParserError, type IntentParser } from '../../../lib/parser/intent-parser'
import { DEMO_API_ERROR_CODES } from '../../../lib/server/demo-api-errors'
import { parseIntentRequest } from '../../../lib/server/llm-route-contracts'
import { checkPaidRequestBoundary } from '../../../lib/server/paid-request-boundary'
import type { PaidRequestLimiter } from '../../../lib/server/paid-request-limiter'
import { clientKeyForRequest } from '../../../lib/server/request-client'
import type { ModelCallGate } from '../../../lib/server/request-gate'
import {
  invalidRequest,
  paidRequestLimitError,
  rateLimited,
  readJsonRequest,
} from '../../../lib/server/request-body'
import {
  createParser,
  MODEL_CALL_GATE,
  NORMALIZE_CONFIG,
  PAID_REQUEST_LIMITER,
  TRUST_FORWARDED_ADDRESS,
} from '../deps'

export async function handleParse(
  request: Request,
  parser: IntentParser,
  gate: ModelCallGate,
  limiter: PaidRequestLimiter,
  trustForwardedAddress = false,
): Promise<Response> {
  const boundary = checkPaidRequestBoundary(request)
  if (!boundary.ok) return boundary.response

  const body = await readJsonRequest(request)
  if (!body.ok) return body.response

  const parsedBody = parseIntentRequest(body.value)
  if (!parsedBody.success) return invalidRequest(parsedBody.error.message)

  const decision = gate.acquire(clientKeyForRequest(request, trustForwardedAddress))
  if (!decision.ok) return rateLimited(decision.retryAfterMs)

  try {
    const sharedError = paidRequestLimitError(await limiter.check(request))
    if (sharedError) return sharedError

    const result = await parser.parse(
      parsedBody.data.currentIntent,
      parsedBody.data.utterance,
      request.signal,
    )
    const intent = fillDefaults(
      fillAssumptions(canonicalizePlaces(result.intent), NORMALIZE_CONFIG),
    )
    return Response.json({ intent, gap: checkGaps(intent, result.unhandled) })
  } catch (error) {
    if (error instanceof ParserError) {
      if (error.reason === 'budget_exhausted') {
        return Response.json(
          { error: DEMO_API_ERROR_CODES.budgetExhausted },
          { status: 503 },
        )
      }
      const status = error.reason === 'invalid_output' ? 422 : 502
      return Response.json({ error: error.reason }, { status })
    }
    throw error
  } finally {
    decision.permit.release()
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleParse(
    request,
    createParser(),
    MODEL_CALL_GATE,
    PAID_REQUEST_LIMITER,
    TRUST_FORWARDED_ADDRESS,
  )
}
