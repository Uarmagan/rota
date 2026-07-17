import {
  toAvailabilityQuery,
  type AvailabilityProvider,
  type SourceBatch,
} from '../../../lib/availability/types'
import { tripIntentSchema } from '../../../lib/schema/trip-intent'
import { checkBrowserRequestOrigin } from '../../../lib/server/paid-request-boundary'
import { clientKeyForRequest } from '../../../lib/server/request-client'
import type { RequestGate, RequestPermit } from '../../../lib/server/request-gate'
import {
  createProvider,
  SEARCH_REQUEST_GATE,
  TRUST_FORWARDED_ADDRESS,
} from '../deps'
import {
  errorMessage,
  invalidRequest,
  rateLimited,
} from '../../../lib/server/request-body'
import { sourceBatchStream } from '../sse'

export const dynamic = 'force-dynamic'

export function handleSearch(
  request: Request,
  provider: AvailabilityProvider,
  gate: RequestGate,
  trustForwardedAddress = false,
): Response {
  const boundary = checkBrowserRequestOrigin(request)
  if (!boundary.ok) return boundary.response

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

  let query
  try {
    query = toAvailabilityQuery(parsedIntent.data)
  } catch (error) {
    return Response.json(
      { error: 'not_searchable', detail: errorMessage(error) },
      { status: 400 },
    )
  }

  const decision = gate.acquire(
    clientKeyForRequest(request, trustForwardedAddress),
  )
  if (!decision.ok) return rateLimited(decision.retryAfterMs)

  const release = releaseOnce(decision.permit)
  const providerController = new AbortController()
  const providerSignal = AbortSignal.any([
    request.signal,
    providerController.signal,
  ])

  try {
    const batches = provider.search(query, providerSignal)
    return sourceBatchStream(
      releasePermitAfter(batches, release),
      request.signal,
      () => {
        providerController.abort()
        release()
      },
    )
  } catch (error) {
    release()
    return Response.json(
      { error: 'not_searchable', detail: errorMessage(error) },
      { status: 400 },
    )
  }
}

export function GET(request: Request): Response {
  return handleSearch(
    request,
    createProvider(),
    SEARCH_REQUEST_GATE,
    TRUST_FORWARDED_ADDRESS,
  )
}

async function* releasePermitAfter(
  batches: AsyncIterable<SourceBatch>,
  release: () => void,
): AsyncGenerator<SourceBatch> {
  try {
    yield* batches
  } finally {
    release()
  }
}

function releaseOnce(permit: RequestPermit): () => void {
  let released = false
  return () => {
    if (released) return
    released = true
    permit.release()
  }
}
