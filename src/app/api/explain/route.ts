import type { ResultExplainer } from '../../../lib/prose/result-explainer'
import { DEMO_API_ERROR_CODES } from '../../../lib/server/demo-api-errors'
import { parseExplanationRequest } from '../../../lib/server/llm-route-contracts'
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
  createExplainer,
  MODEL_CALL_GATE,
  PAID_REQUEST_LIMITER,
  TRUST_FORWARDED_ADDRESS,
} from '../deps'

export async function handleExplain(
  request: Request,
  explainer: ResultExplainer,
  gate: ModelCallGate,
  limiter: PaidRequestLimiter,
  trustForwardedAddress = false,
): Promise<Response> {
  const boundary = checkPaidRequestBoundary(request)
  if (!boundary.ok) return boundary.response

  const body = await readJsonRequest(request)
  if (!body.ok) return body.response

  const parsedBody = parseExplanationRequest(body.value)
  if (!parsedBody.success) return invalidRequest(parsedBody.error.message)

  const decision = gate.acquire(clientKeyForRequest(request, trustForwardedAddress))
  if (!decision.ok) return rateLimited(decision.retryAfterMs)

  try {
    const sharedError = paidRequestLimitError(await limiter.check(request))
    if (sharedError) return sharedError

    const result = await explainer.explain(parsedBody.data.facts)
    if (result.source === 'budget_exhausted') {
      return Response.json(
        { error: DEMO_API_ERROR_CODES.budgetExhausted },
        { status: 503 },
      )
    }
    return Response.json(result)
  } finally {
    decision.permit.release()
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleExplain(
    request,
    createExplainer(),
    MODEL_CALL_GATE,
    PAID_REQUEST_LIMITER,
    TRUST_FORWARDED_ADDRESS,
  )
}
