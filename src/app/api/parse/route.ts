import { checkGaps } from '../../../lib/engine/gaps'
import {
  canonicalizePlaces,
  fillAssumptions,
  fillDefaults,
} from '../../../lib/engine/normalize'
import { ParserError, type IntentParser } from '../../../lib/parser/intent-parser'
import { parseIntentRequest } from '../../../lib/server/llm-route-contracts'
import { clientKeyForRequest } from '../../../lib/server/request-client'
import type { ModelCallGate } from '../../../lib/server/request-gate'
import {
  invalidRequest,
  rateLimited,
  readJsonRequest,
} from '../../../lib/server/request-body'
import {
  createParser,
  MODEL_CALL_GATE,
  NORMALIZE_CONFIG,
  TRUST_FORWARDED_ADDRESS,
} from '../deps'

export async function handleParse(
  request: Request,
  parser: IntentParser,
  gate: ModelCallGate,
  trustForwardedAddress = false,
): Promise<Response> {
  const body = await readJsonRequest(request)
  if (!body.ok) return body.response

  const parsedBody = parseIntentRequest(body.value)
  if (!parsedBody.success) return invalidRequest(parsedBody.error.message)

  const decision = gate.acquire(clientKeyForRequest(request, trustForwardedAddress))
  if (!decision.ok) return rateLimited(decision.retryAfterMs)

  try {
    const result = await parser.parse(
      parsedBody.data.currentIntent,
      parsedBody.data.utterance,
    )
    const intent = fillDefaults(
      fillAssumptions(canonicalizePlaces(result.intent), NORMALIZE_CONFIG),
    )
    return Response.json({ intent, gap: checkGaps(intent, result.unhandled) })
  } catch (error) {
    if (error instanceof ParserError) {
      if (error.reason === 'budget_exhausted') {
        return Response.json(
          { error: 'demo_budget_exhausted' },
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
    TRUST_FORWARDED_ADDRESS,
  )
}
