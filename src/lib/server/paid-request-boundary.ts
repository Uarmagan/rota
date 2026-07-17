export type RequestBoundaryResult =
  | { ok: true }
  | { ok: false; response: Response }

export function checkBrowserRequestOrigin(
  request: Request,
): RequestBoundaryResult {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite !== null && fetchSite !== 'same-origin') {
    return crossSiteRequest()
  }

  const origin = request.headers.get('origin')
  if (origin !== null && origin !== new URL(request.url).origin) {
    return crossSiteRequest()
  }

  return { ok: true }
}

export function checkPaidRequestBoundary(
  request: Request,
): RequestBoundaryResult {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim()
  if (mediaType?.toLowerCase() !== 'application/json') {
    return {
      ok: false,
      response: Response.json(
        { error: 'unsupported_media_type' },
        { status: 415 },
      ),
    }
  }
  return checkBrowserRequestOrigin(request)
}

function crossSiteRequest(): RequestBoundaryResult {
  return {
    ok: false,
    response: Response.json({ error: 'cross_site_request' }, { status: 403 }),
  }
}
