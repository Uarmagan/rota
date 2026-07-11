import type { AwardPriceDisplay, AwardPricingInputs } from './types'

export const FEES_MILES_PER_USD = 80

export function milesEquivalent(pricing: AwardPricingInputs): number {
  return pricing.baseMiles + pricing.feesUsd * FEES_MILES_PER_USD
}

export function computeAwardPrice(
  pricing: AwardPricingInputs,
  travelers: number,
): AwardPriceDisplay {
  return {
    totalMiles: pricing.baseMiles * travelers,
    totalFeesUsd: pricing.feesUsd * travelers,
    program: pricing.program,
  }
}
