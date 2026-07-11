export type Random = () => number

export function hashSeed(input: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function mulberry32(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function drawInt(rng: Random, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function pickOne<T>(rng: Random, values: readonly T[]): T {
  const value = values[Math.floor(rng() * values.length)]
  if (value === undefined) throw new Error('Cannot pick from an empty list')
  return value
}

export function pickWeighted<T>(
  rng: Random,
  values: readonly { value: T; weight: number }[],
): T {
  const total = values.reduce((sum, entry) => sum + entry.weight, 0)
  let draw = rng() * total
  for (const entry of values) {
    draw -= entry.weight
    if (draw < 0) return entry.value
  }
  const fallback = values.at(-1)
  if (fallback === undefined) throw new Error('Cannot pick from an empty list')
  return fallback.value
}
