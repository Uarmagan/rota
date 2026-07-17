import type { ResultExplainer } from '../../../lib/prose/result-explainer'
import { DEMO_API_ERROR_CODES } from '../../../lib/server/demo-api-errors'
import { parseExplanationRequest } from '../../../lib/server/llm-route-contracts'
import { clientKeyForRequest } from '../../../lib/server/request-client'
import type { ModelCallGate } from '../../../lib/server/request-gate'
import {
  invalidRequest,
  rateLimited,
  readJsonRequest,
} from '../../../lib/server/request-body'
import {
  createExplainer,
  MODEL_CALL_GATE,
  TRUST_FORWARDED_ADDRESS,
} from '../deps'

export async function handleExplain(
  request: Request,
  explainer: ResultExplainer,
  gate: ModelCallGate,
  trustForwardedAddress = false,
): Promise<Response> {
  const body = await readJsonRequest(request)
  if (!body.ok) return body.response

  const parsedBody = parseExplanationRequest(body.value)
  if (!parsedBody.success) return invalidRequest(parsedBody.error.message)

  const decision = gate.acquire(clientKeyForRequest(request, trustForwardedAddress))
  if (!decision.ok) return rateLimited(decision.retryAfterMs)

  try {
    const result = await explainer.explain(parsedBody.data.facts, request.signal)
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
    TRUST_FORWARDED_ADDRESS,
  )
}
