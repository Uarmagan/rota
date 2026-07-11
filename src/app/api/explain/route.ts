import { z } from 'zod'
import { explanationFactsSchema } from '../../../lib/engine/facts-schema'
import type { ResultExplainer } from '../../../lib/prose/result-explainer'
import { createExplainer } from '../deps'
import { errorMessage, invalidRequest } from '../http'

const requestSchema = z.object({ facts: explanationFactsSchema })

export async function handleExplain(
  request: Request,
  explainer: ResultExplainer,
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    return invalidRequest(errorMessage(error))
  }
  const parsedBody = requestSchema.safeParse(body)
  if (!parsedBody.success) return invalidRequest(parsedBody.error.message)
  return Response.json(await explainer.explain(parsedBody.data.facts))
}

export async function POST(request: Request): Promise<Response> {
  return handleExplain(request, createExplainer())
}
