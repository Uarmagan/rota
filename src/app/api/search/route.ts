import {
  toAvailabilityQuery,
  type AvailabilityProvider,
} from '../../../lib/availability/types'
import { tripIntentSchema } from '../../../lib/schema/trip-intent'
import { createProvider } from '../deps'
import { errorMessage, invalidRequest } from '../http'
import { sourceBatchStream } from '../sse'

export const dynamic = 'force-dynamic'

export function handleSearch(
  request: Request,
  provider: AvailabilityProvider,
): Response {
  const rawIntent = new URL(request.url).searchParams.get('intent')
  if (rawIntent === null) return invalidRequest('Missing intent query parameter')

  let input: unknown
  try {
    input = JSON.parse(rawIntent)
  } catch (error) {
    return invalidRequest(errorMessage(error))
  }
  const parsedIntent = tripIntentSchema.safeParse(input)
  if (!parsedIntent.success) return invalidRequest(parsedIntent.error.message)

  try {
    const query = toAvailabilityQuery(parsedIntent.data)
    return sourceBatchStream(provider.search(query), request.signal)
  } catch (error) {
    return Response.json(
      { error: 'not_searchable', detail: errorMessage(error) },
      { status: 400 },
    )
  }
}

export function GET(request: Request): Response {
  return handleSearch(request, createProvider())
}
