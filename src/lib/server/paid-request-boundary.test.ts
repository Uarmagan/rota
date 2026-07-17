import { describe, expect, it } from 'vitest'
import {
  checkBrowserRequestOrigin,
  checkPaidRequestBoundary,
} from './paid-request-boundary'

describe('checkBrowserRequestOrigin', () => {
  it('accepts matching origin metadata', () => {
    expect(
      checkBrowserRequestOrigin(request({ origin: 'https://rota.example' })),
    ).toEqual({ ok: true })
  })

  it.each([
    ['malformed', 'not an origin'],
    ['null', 'null'],
    ['mismatched', 'https://attacker.example'],
  ])('rejects a %s Origin value', async (_label, origin) => {
    await expectCrossSiteRejection(
      checkBrowserRequestOrigin(request({ origin })),
    )
  })

  it('accepts same-origin fetch metadata', () => {
    expect(
      checkBrowserRequestOrigin(request({ 'sec-fetch-site': 'same-origin' })),
    ).toEqual({ ok: true })
  })

  it.each(['same-site', 'cross-site', 'none', 'unexpected'])(
    'rejects Sec-Fetch-Site: %s',
    async (site) => {
      await expectCrossSiteRejection(
        checkBrowserRequestOrigin(request({ 'sec-fetch-site': site })),
      )
    },
  )

  it.each([
    {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'same-origin',
    },
    {
      origin: 'https://rota.example',
      'sec-fetch-site': 'cross-site',
    },
  ])('rejects conflicting browser headers', async (headers) => {
    await expectCrossSiteRejection(checkBrowserRequestOrigin(request(headers)))
  })

  it('accepts requests without browser provenance headers', () => {
    expect(checkBrowserRequestOrigin(request({}))).toEqual({ ok: true })
  })
})

describe('checkPaidRequestBoundary', () => {
  it('accepts same-origin JSON browser requests', () => {
    const result = checkPaidRequestBoundary(
      request({
        'content-type': 'application/json',
        origin: 'https://rota.example',
        'sec-fetch-site': 'same-origin',
      }),
    )

    expect(result).toEqual({ ok: true })
  })

  it('accepts mixed-case JSON with a charset parameter', () => {
    const result = checkPaidRequestBoundary(
      request({ 'content-type': 'Application/JSON; charset=utf-8' }),
    )

    expect(result).toEqual({ ok: true })
  })

  it('rejects unsupported media before cross-site metadata', async () => {
    const result = checkPaidRequestBoundary(
      request({
        'content-type': 'text/plain',
        origin: 'https://attacker.example',
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(415)
    expect(await result.response.json()).toEqual({
      error: 'unsupported_media_type',
    })
  })

  it.each([
    ['missing', {}],
    ['plain text', { 'content-type': 'text/plain' }],
    ['form data', { 'content-type': 'application/x-www-form-urlencoded' }],
    ['unrelated JSON', { 'content-type': 'application/problem+json' }],
  ])('rejects %s media before browser provenance', async (_label, headers) => {
    const result = checkPaidRequestBoundary(request(headers))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(415)
    expect(await result.response.json()).toEqual({
      error: 'unsupported_media_type',
    })
  })
})

function request(headers: Record<string, string>): Request {
  return new Request('https://rota.example/api/parse', { headers })
}

async function expectCrossSiteRejection(
  result: ReturnType<typeof checkBrowserRequestOrigin>,
): Promise<void> {
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.response.status).toBe(403)
  expect(await result.response.json()).toEqual({ error: 'cross_site_request' })
}
