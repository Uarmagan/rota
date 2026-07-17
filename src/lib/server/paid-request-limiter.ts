import { checkRateLimit } from '@vercel/firewall'

export const PAID_REQUEST_RATE_LIMIT_ID = 'rota-paid-api-visitor'

export type PaidRequestLimitDecision =
  | { status: 'allowed' }
  | { status: 'rate_limited' }
  | { status: 'unavailable' }

export interface PaidRequestLimiter {
  check(request: Request): Promise<PaidRequestLimitDecision>
}

type CheckRateLimit = (
  rateLimitId: string,
  options: { request: Request },
) => Promise<unknown>

type PaidRequestLimiterEnvironment = Readonly<
  Record<string, string | undefined>
>

const localPaidRequestLimiter: PaidRequestLimiter = {
  async check() {
    return { status: 'allowed' }
  },
}

const unavailablePaidRequestLimiter: PaidRequestLimiter = {
  async check() {
    return { status: 'unavailable' }
  },
}

export function createVercelPaidRequestLimiter(
  check: CheckRateLimit = checkRateLimit,
): PaidRequestLimiter {
  return {
    async check(request) {
      let result: unknown
      try {
        result = await check(PAID_REQUEST_RATE_LIMIT_ID, { request })
      } catch {
        return { status: 'unavailable' }
      }
      if (
        typeof result === 'object' &&
        result !== null &&
        'rateLimited' in result &&
        typeof result.rateLimited === 'boolean' &&
        !('error' in result && result.error !== undefined)
      ) {
        return {
          status: result.rateLimited ? 'rate_limited' : 'allowed',
        }
      }
      return { status: 'unavailable' }
    },
  }
}

export function paidRequestLimiterFromEnvironment(
  environment: PaidRequestLimiterEnvironment,
  check: CheckRateLimit = checkRateLimit,
): PaidRequestLimiter {
  if (environment.VERCEL === '1') {
    return environment.ROTA_PAID_RATE_LIMIT_CONFIGURED === 'true'
      ? createVercelPaidRequestLimiter(check)
      : unavailablePaidRequestLimiter
  }

  if (
    environment.NODE_ENV === 'development' ||
    environment.NODE_ENV === 'test'
  ) {
    return localPaidRequestLimiter
  }

  return unavailablePaidRequestLimiter
}
