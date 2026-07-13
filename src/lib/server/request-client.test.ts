import { describe, expect, it } from 'vitest'
import { clientKeyForRequest, normalizeClientKey } from './request-client'

describe('request client identity', () => {
  it('uses one anonymous bucket unless proxy trust is explicit', () => {
    const request = forwardedRequest('203.0.113.7, 10.0.0.2')

    expect(clientKeyForRequest(request, false)).toBe('anonymous')
  })

  it('uses only the first address from a trusted forwarded header', () => {
    const request = forwardedRequest('203.0.113.7, 10.0.0.2')

    expect(clientKeyForRequest(request, true)).toBe('forwarded:203.0.113.7')
  })

  it('bounds retained client-key length', () => {
    expect(normalizeClientKey('x'.repeat(201))).toHaveLength(200)
  })
})

function forwardedRequest(value: string): Request {
  return new Request('http://localhost', {
    headers: { 'x-forwarded-for': value },
  })
}
