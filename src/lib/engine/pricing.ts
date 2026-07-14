import type { CashPricingInputs, PriceDisplay } from './types'

export function computePartyPrice(
  pricing: CashPricingInputs,
  travelers: number,
): PriceDisplay {
  return { totalUsd: pricing.priceUsd * travelers }
}
