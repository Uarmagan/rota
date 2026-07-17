import {
  generateSourceOptionsFromRandom,
  sourceRandom,
} from './generate'
import { SIMULATED_SOURCES } from './sources'
import type {
  AvailabilityProvider,
  AvailabilityQuery,
  DelayFn,
  SourceBatch,
  SourcePersonality,
} from './types'

export const DEFAULT_BASE_SEED = 20270710

export interface PlannedBatch extends SourceBatch {
  atMs: number
}

export interface SimulationConfig {
  baseSeed?: number
  delay?: DelayFn
  sources?: readonly SourcePersonality[]
}

export function planAvailability(
  query: AvailabilityQuery,
  config: SimulationConfig = {},
): readonly PlannedBatch[] {
  const baseSeed = config.baseSeed ?? DEFAULT_BASE_SEED
  const sources = config.sources ?? SIMULATED_SOURCES
  const plan: PlannedBatch[] = []

  for (const source of sources) {
    const rng = sourceRandom(source, query, baseSeed)
    const options = generateSourceOptionsFromRandom(source, query, rng)
    const firstAtMs = drawRange(rng(), source.firstBatchMs)

    if (source.batches === 1 || options.length === 0) {
      plan.push({
        source: source.id,
        batchIndex: 0,
        isFinal: true,
        options,
        atMs: firstAtMs,
      })
      continue
    }

    const splitAt = Math.ceil(options.length * 0.6)
    plan.push({
      source: source.id,
      batchIndex: 0,
      isFinal: false,
      options: options.slice(0, splitAt),
      atMs: firstAtMs,
    })
    plan.push({
      source: source.id,
      batchIndex: 1,
      isFinal: true,
      options: options.slice(splitAt),
      atMs: firstAtMs + drawRange(rng(), source.interBatchMs),
    })
  }

  return plan.sort(
    (left, right) => left.atMs - right.atMs || left.source.localeCompare(right.source),
  )
}

export function createSimulatedAvailability(
  config: SimulationConfig = {},
): AvailabilityProvider {
  const delay = config.delay ?? realDelay

  return {
    async *search(query, signal) {
      if (signal.aborted) return
      let elapsed = 0
      for (const { atMs, ...batch } of planAvailability(query, config)) {
        if (signal.aborted) return
        await delay(atMs - elapsed, signal)
        if (signal.aborted) return
        yield batch
        elapsed = atMs
      }
    },
  }
}

function realDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    const abort = (): void => {
      clearTimeout(timer)
      finish()
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

function drawRange(draw: number, [min, max]: readonly [number, number]): number {
  return min + draw * (max - min)
}
