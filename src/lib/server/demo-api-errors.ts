export const DEMO_API_ERROR_CODES = {
  rateLimited: 'rate_limited',
  budgetExhausted: 'demo_budget_exhausted',
} as const

export type DemoApiErrorCode =
  (typeof DEMO_API_ERROR_CODES)[keyof typeof DEMO_API_ERROR_CODES]

export function isDemoApiErrorCode(value: unknown): value is DemoApiErrorCode {
  return Object.values(DEMO_API_ERROR_CODES).some((code) => code === value)
}
