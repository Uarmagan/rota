import { z } from 'zod'
import { checkGaps } from '../../../lib/engine/gaps'
import {
  canonicalizePlaces,
  fillAssumptions,
  fillDefaults,
} from '../../../lib/engine/normalize'
import { ParserError, type IntentParser } from '../../../lib/parser/intent-parser'
import { tripIntentSchema } from '../../../lib/schema/trip-intent'
import { createParser, NORMALIZE_CONFIG } from '../deps'
import { errorMessage, invalidRequest } from '../http'

const requestSchema = z.object({
  currentIntent: tripIntentSchema,
  utterance: z.string().min(1),
})

export async function handleParse(
  request: Request,
  parser: IntentParser,
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    return invalidRequest(errorMessage(error))
  }
  const parsedBody = requestSchema.safeParse(body)
  if (!parsedBody.success) return invalidRequest(parsedBody.error.message)

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
      const status = error.reason === 'invalid_output' ? 422 : 502
      return Response.json({ error: error.reason }, { status })
    }
    throw error
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleParse(request, createParser())
}
