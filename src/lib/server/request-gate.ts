// This in-memory gate is per process only. Multi-instance deployments still require
// an authoritative edge/shared limiter and a provider billing ceiling.

export interface ModelCallPermit {
  release(): void
}

export type ModelCallGateDecision =
  | { ok: true; permit: ModelCallPermit }
  | { ok: false; retryAfterMs: number }

export interface ModelCallGate {
  acquire(clientKey: string): ModelCallGateDecision
}

export interface ModelCallGateConfig {
  maxConcurrency: number
  globalCallsPerWindow: number
  clientCallsPerWindow: number
  windowMs: number
  maxClientKeys: number
  clock?: () => number
}

interface WindowBucket {
  calls: number
  startedAt: number
  lastSeenAt: number
}

const CONCURRENCY_RETRY_AFTER_MS = 1_000

export function createModelCallGate(config: ModelCallGateConfig): ModelCallGate {
  validateConfig(config)

  const clock = config.clock ?? Date.now
  let activeCalls = 0
  let globalBucket = newBucket(clock())
  const clientBuckets = new Map<string, WindowBucket>()

  return {
    acquire(clientKey) {
      const now = clock()
      globalBucket = currentBucket(globalBucket, now, config.windowMs)
      pruneExpiredClients(clientBuckets, now, config.windowMs)

      if (activeCalls >= config.maxConcurrency) {
        return { ok: false, retryAfterMs: CONCURRENCY_RETRY_AFTER_MS }
      }
      if (globalBucket.calls >= config.globalCallsPerWindow) {
        return {
          ok: false,
          retryAfterMs: retryAfter(globalBucket, now, config.windowMs),
        }
      }

      let clientBucket = clientBuckets.get(clientKey)
      if (!clientBucket) {
        evictOldestClientIfFull(clientBuckets, config.maxClientKeys)
        clientBucket = newBucket(now)
        clientBuckets.set(clientKey, clientBucket)
      }
      clientBucket.lastSeenAt = now
      if (clientBucket.calls >= config.clientCallsPerWindow) {
        return {
          ok: false,
          retryAfterMs: retryAfter(clientBucket, now, config.windowMs),
        }
      }

      globalBucket.calls += 1
      globalBucket.lastSeenAt = now
      clientBucket.calls += 1
      activeCalls += 1
      let released = false

      return {
        ok: true,
        permit: {
          release() {
            if (released) return
            released = true
            activeCalls -= 1
          },
        },
      }
    },
  }
}

function newBucket(now: number): WindowBucket {
  return { calls: 0, startedAt: now, lastSeenAt: now }
}

function currentBucket(
  bucket: WindowBucket,
  now: number,
  windowMs: number,
): WindowBucket {
  return now - bucket.startedAt >= windowMs ? newBucket(now) : bucket
}

function retryAfter(
  bucket: WindowBucket,
  now: number,
  windowMs: number,
): number {
  return Math.max(1, bucket.startedAt + windowMs - now)
}

function pruneExpiredClients(
  buckets: Map<string, WindowBucket>,
  now: number,
  windowMs: number,
): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.startedAt >= windowMs) buckets.delete(key)
  }
}

function evictOldestClientIfFull(
  buckets: Map<string, WindowBucket>,
  maximum: number,
): void {
  if (buckets.size < maximum) return

  let oldestKey: string | null = null
  let oldestSeenAt = Infinity
  for (const [key, bucket] of buckets) {
    if (bucket.lastSeenAt < oldestSeenAt) {
      oldestKey = key
      oldestSeenAt = bucket.lastSeenAt
    }
  }
  if (oldestKey !== null) buckets.delete(oldestKey)
}

function validateConfig(config: ModelCallGateConfig): void {
  for (const [name, value] of Object.entries(config)) {
    if (name === 'clock') continue
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new Error(`Invalid model-call gate configuration: ${name}`)
    }
  }
}
