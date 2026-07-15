import type { ExplanationFacts, OptionComparison } from '../engine/types'

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
  million: 1000000,
}

const VAGUE_WORDS = new Set([
  'half',
  'quarter',
  'dozen',
  'couple',
  'few',
  'several',
])

export function allowedNumbers(facts: ExplanationFacts): ReadonlySet<number> {
  const allowed = new Set<number>([
    facts.stops,
    facts.price.totalUsd,
  ])
  addDuration(allowed, facts.totalDurationMinutes)
  if (facts.arriveBy !== null) {
    const [hours, minutes] = facts.arriveBy.split(':').map(Number)
    allowed.add(hours)
    allowed.add(hours % 12 === 0 ? 12 : hours % 12)
    allowed.add(minutes)
  }
  addComparison(allowed, facts.vsCheapest)
  addComparison(allowed, facts.vsFastest)
  return allowed
}

export function checkNumberProvenance(
  copy: string,
  facts: ExplanationFacts,
): { ok: true } | { ok: false; violations: string[] } {
  const allowed = allowedNumbers(facts)
  const violations: string[] = []
  for (const match of copy.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) {
    const token = match[0]
    if (!allowed.has(Number(token.replaceAll(',', '')))) violations.push(token)
  }
  const words = copy.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  for (const word of words) {
    if (VAGUE_WORDS.has(word)) {
      violations.push(word)
      continue
    }
    const value = NUMBER_WORDS[word]
    if (value !== undefined && !allowed.has(value)) violations.push(word)
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations }
}

function addDuration(allowed: Set<number>, minutes: number): void {
  allowed.add(minutes)
  allowed.add(Math.floor(minutes / 60))
  allowed.add(minutes % 60)
}

function addComparison(
  allowed: Set<number>,
  comparison: OptionComparison | null,
): void {
  if (comparison === null) return
  allowed.add(Math.abs(comparison.stopsDelta))
  addDuration(allowed, Math.abs(comparison.durationDeltaMinutes))
  addDuration(allowed, Math.abs(comparison.arrivalDeltaMinutes))
  allowed.add(Math.abs(comparison.totalUsdDelta))
}
