import { describe, expect, it } from 'vitest'
import { SIMULATED_SOURCES } from './sources'

describe('SIMULATED_SOURCES', () => {
  it('defines the four locked source personalities', () => {
    expect(SIMULATED_SOURCES).toEqual([
      {
        id: 'meridian',
        program: 'Meridian Rewards',
        inventory: [12, 16],
        connectionBias: 0.45,
        cabinWeights: {
          economy: 0.7,
          premium_economy: 0.12,
          business: 0.14,
          first: 0.04,
        },
        milesMultiplier: 1,
        milesJitter: 0.15,
        feesUsd: [15, 60],
        batches: 2,
        firstBatchMs: [300, 450],
        interBatchMs: [200, 300],
      },
      {
        id: 'aurora',
        program: 'Aurora Premier',
        inventory: [4, 7],
        connectionBias: 0.25,
        cabinWeights: {
          economy: 0.25,
          premium_economy: 0.15,
          business: 0.45,
          first: 0.15,
        },
        milesMultiplier: 1.35,
        milesJitter: 0.1,
        feesUsd: [20, 80],
        batches: 1,
        firstBatchMs: [850, 1000],
        interBatchMs: [0, 0],
      },
      {
        id: 'zephyr',
        program: 'Zephyr Flying Club',
        inventory: [8, 12],
        connectionBias: 0.5,
        cabinWeights: {
          economy: 0.55,
          premium_economy: 0.15,
          business: 0.25,
          first: 0.05,
        },
        milesMultiplier: 0.9,
        milesJitter: 0.1,
        feesUsd: [180, 420],
        batches: 2,
        firstBatchMs: [1300, 1500],
        interBatchMs: [450, 600],
      },
      {
        id: 'vantage',
        program: 'Vantage Awards',
        inventory: [10, 14],
        connectionBias: 0.75,
        cabinWeights: {
          economy: 0.8,
          premium_economy: 0.1,
          business: 0.09,
          first: 0.01,
        },
        milesMultiplier: 0.75,
        milesJitter: 0.25,
        feesUsd: [10, 45],
        batches: 2,
        firstBatchMs: [1750, 1950],
        interBatchMs: [450, 650],
      },
    ])
  })
})
