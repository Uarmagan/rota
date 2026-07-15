import type { SourcePersonality } from './types'

export const SIMULATED_SOURCES: readonly SourcePersonality[] = [
  // Broad, fast aggregator with economy-heavy inventory and mild pricing.
  {
    id: 'meridian',
    inventory: [12, 16],
    connectionBias: 0.45,
    cabinWeights: { economy: 0.7, premium_economy: 0.12, business: 0.14, first: 0.04 },
    priceMultiplier: 1,
    priceJitter: 0.15,
    batches: 2,
    firstBatchMs: [300, 450],
    interBatchMs: [200, 300],
  },
  // Slow boutique with tiny inventory that leans premium at expensive prices.
  {
    id: 'aurora',
    inventory: [4, 7],
    connectionBias: 0.25,
    cabinWeights: { economy: 0.25, premium_economy: 0.15, business: 0.45, first: 0.15 },
    priceMultiplier: 1.35,
    priceJitter: 0.1,
    batches: 1,
    firstBatchMs: [850, 1000],
    interBatchMs: [0, 0],
  },
  // Broad inventory with mildly discounted pricing.
  {
    id: 'zephyr',
    inventory: [8, 12],
    connectionBias: 0.5,
    cabinWeights: { economy: 0.55, premium_economy: 0.15, business: 0.25, first: 0.05 },
    priceMultiplier: 0.9,
    priceJitter: 0.1,
    batches: 2,
    firstBatchMs: [1300, 1500],
    interBatchMs: [450, 600],
  },
  // Slow completionist with mostly one-stops and volatile budget pricing.
  {
    id: 'vantage',
    inventory: [10, 14],
    connectionBias: 0.75,
    cabinWeights: { economy: 0.8, premium_economy: 0.1, business: 0.09, first: 0.01 },
    priceMultiplier: 0.75,
    priceJitter: 0.25,
    batches: 2,
    firstBatchMs: [1750, 1950],
    interBatchMs: [450, 650],
  },
]
