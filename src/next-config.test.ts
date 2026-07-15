import { describe, expect, it } from 'vitest'
import nextConfig from '../next.config'

describe('Next.js response headers', () => {
  it('applies the public-site security headers to every route', async () => {
    expect(nextConfig.headers).toBeTypeOf('function')

    await expect(nextConfig.headers!()).resolves.toEqual([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ])
  })
})
