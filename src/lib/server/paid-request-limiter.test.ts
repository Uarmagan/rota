import { describe, expect, it, vi } from 'vitest'
import {
  PAID_REQUEST_RATE_LIMIT_ID,
  createVercelPaidRequestLimiter,
  paidRequestLimiterFromEnvironment,
} from './paid-request-limiter'

describe('createVercelPaidRequestLimiter', () => {
  it('checks the shared IP-backed instrument with the original request', async () => {
    const checkRateLimit = vi.fn().mockResolvedValue({ rateLimited: false })
    const limiter = createVercelPaidRequestLimiter(checkRateLimit)
    const request = new Request('https://rota.example/api/parse')

    await expect(limiter.check(request)).resolves.toEqual({ status: 'allowed' })
    expect(checkRateLimit).toHaveBeenCalledWith(PAID_REQUEST_RATE_LIMIT_ID, {
      request,
    })
  })

  it('reports a shared rate-limit rejection', async () => {
    const limiter = createVercelPaidRequestLimiter(
      vi.fn().mockResolvedValue({ rateLimited: true }),
    )

    await expect(
      limiter.check(new Request('https://rota.example/api/parse')),
    ).resolves.toEqual({ status: 'rate_limited' })
  })

  it.each([
    { name: 'an SDK error result', result: { rateLimited: false, error: 'not-found' } },
    { name: 'a malformed SDK result', result: {} },
  ])('fails closed for $name', async ({ result }) => {
    const limiter = createVercelPaidRequestLimiter(
      vi.fn().mockResolvedValue(result),
    )

    await expect(
      limiter.check(new Request('https://rota.example/api/parse')),
    ).resolves.toEqual({ status: 'unavailable' })
  })

  it('fails closed when the SDK throws', async () => {
    const limiter = createVercelPaidRequestLimiter(
      vi.fn().mockRejectedValue(new Error('SDK unavailable')),
    )

    await expect(
      limiter.check(new Request('https://rota.example/api/parse')),
    ).resolves.toEqual({ status: 'unavailable' })
  })
})

describe('paidRequestLimiterFromEnvironment', () => {
  it.each(['development', 'test'])('allows local %s requests', async (nodeEnv) => {
    const limiter = paidRequestLimiterFromEnvironment({ NODE_ENV: nodeEnv })

    await expect(
      limiter.check(new Request('http://localhost/api/parse')),
    ).resolves.toEqual({ status: 'allowed' })
  })

  it('uses the Vercel adapter only with the exact attestation', async () => {
    const checkRateLimit = vi.fn().mockResolvedValue({ rateLimited: false })
    const limiter = paidRequestLimiterFromEnvironment(
      {
        NODE_ENV: 'production',
        VERCEL: '1',
        ROTA_PAID_RATE_LIMIT_CONFIGURED: 'true',
      },
      checkRateLimit,
    )

    await expect(
      limiter.check(new Request('https://rota.example/api/parse')),
    ).resolves.toEqual({ status: 'allowed' })
    expect(checkRateLimit).toHaveBeenCalledOnce()
  })

  it.each([
    { name: 'Vercel without attestation', environment: { VERCEL: '1' } },
    {
      name: 'Vercel with an inexact attestation',
      environment: {
        VERCEL: '1',
        ROTA_PAID_RATE_LIMIT_CONFIGURED: 'TRUE',
      },
    },
    {
      name: 'local production despite attestation',
      environment: {
        NODE_ENV: 'production',
        ROTA_PAID_RATE_LIMIT_CONFIGURED: 'true',
      },
    },
    { name: 'an unknown environment', environment: {} },
    {
      name: 'development identified as Vercel',
      environment: { NODE_ENV: 'development', VERCEL: '1' },
    },
  ])('fails closed in $name', async ({ environment }) => {
    const limiter = paidRequestLimiterFromEnvironment(environment)

    await expect(
      limiter.check(new Request('https://rota.example/api/parse')),
    ).resolves.toEqual({ status: 'unavailable' })
  })
})
