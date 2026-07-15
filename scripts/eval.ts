import { isDeepStrictEqual } from 'node:util'
import { computeIntentDiff } from '../src/lib/engine/diff'
import { canonicalizePlaces } from '../src/lib/engine/normalize'
import { parserFixtures, type ParserFixture } from '../src/lib/parser/fixtures'
import { OpenAIIntentParser } from '../src/lib/parser/openai-intent-parser'
import {
  parseArgs,
  requiredCorrectReps,
  requiresPerfectRun,
  selectFixtures,
  unhandledMatches as matchesUnhandled,
  validateFixtureRun,
  wordingHit,
} from './eval-policy'

interface RepResult {
  correct: boolean
  retried: boolean
  latencyMs: number
  softWordingHit: boolean | null
  failure: string | null
}

interface ScorecardRow {
  fixture: string
  requiredPassRate: string
  result: 'PASS' | 'FAIL'
  passRate: string
  retryRate: string
  p50Ms: number
  p95Ms: number
  softWording: string
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to run the live parser eval')
  }

  const options = parseArgs(process.argv.slice(2))
  const fixtures = selectFixtures(parserFixtures, options)
  validateFixtureRun(fixtures, options.reps)

  const rows: ScorecardRow[] = []
  let passingFixtures = 0
  let passingReps = 0
  let totalReps = 0

  for (const fixture of fixtures) {
    const results: RepResult[] = []
    for (let rep = 0; rep < options.reps; rep += 1) {
      results.push(await runRep(fixture, options.model))
    }

    const correct = results.filter((result) => result.correct).length
    const perfectRunRequired = requiresPerfectRun(fixture)
    const required = requiredCorrectReps(fixture, options.reps)
    const passed = correct >= required
    if (passed) passingFixtures += 1
    passingReps += correct
    totalReps += results.length

    const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b)
    const wordingChecks = results.filter((result) => result.softWordingHit !== null)
    const wordingHits = wordingChecks.filter((result) => result.softWordingHit).length
    rows.push({
      fixture: fixture.name,
      requiredPassRate: perfectRunRequired ? '100%' : '80%',
      result: passed ? 'PASS' : 'FAIL',
      passRate: `${correct}/${results.length}`,
      retryRate: `${results.filter((result) => result.retried).length}/${results.length}`,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      softWording:
        wordingChecks.length === 0 ? 'n/a' : `${wordingHits}/${wordingChecks.length}`,
    })

    results.forEach((result, index) => {
      if (result.failure) {
        console.error(`${fixture.name} rep ${index + 1}: ${result.failure}`)
      }
    })
  }

  console.table(rows)
  const overall = passingFixtures === fixtures.length ? 'PASS' : 'FAIL'
  console.log(
    `Overall: ${overall} | ` +
      `model: ${options.model ?? process.env.ROTA_MODEL ?? 'gpt-5.6-luna'} | ` +
      `suite: ${options.challengeOnly ? 'challenge' : 'all'} | ` +
      `fixtures: ${passingFixtures}/${fixtures.length} | reps: ${passingReps}/${totalReps}`,
  )

  if (passingFixtures !== fixtures.length) process.exitCode = 1
}

async function runRep(
  fixture: ParserFixture,
  model: string | undefined,
): Promise<RepResult> {
  const parser = new OpenAIIntentParser(fixture.context, { model })
  const started = performance.now()

  try {
    const result = await parser.parse(fixture.currentIntent, fixture.utterance)
    const canonical = canonicalizePlaces(result.intent)
    const changedFields = computeIntentDiff(fixture.currentIntent, canonical)
      .map((change) => change.field)
      .sort()
    const expectedFields = [...fixture.expectedChangedFields].sort()
    const softWordingHit = wordingHit(result.unhandled, fixture.expectedUnhandled)
    const unhandledIsCorrect = matchesUnhandled(fixture, result.unhandled)
    const intentMatches = isDeepStrictEqual(canonical, fixture.expected)
    const changedFieldsMatch = isDeepStrictEqual(changedFields, expectedFields)
    const correct = intentMatches && changedFieldsMatch && unhandledIsCorrect

    return {
      correct,
      retried: parser.lastAttemptCount > 1,
      latencyMs: Math.round(performance.now() - started),
      softWordingHit,
      failure: correct
        ? null
        : formatMismatch({
            intentMatches,
            changedFieldsMatch,
            unhandledMatches: unhandledIsCorrect,
            canonical,
            expected: fixture.expected,
            changedFields,
            expectedFields,
            unhandled: result.unhandled,
            expectedUnhandled: fixture.expectedUnhandled,
          }),
    }
  } catch (error) {
    return {
      correct: false,
      retried: parser.lastAttemptCount > 1,
      latencyMs: Math.round(performance.now() - started),
      softWordingHit: null,
      failure: error instanceof Error ? error.message : String(error),
    }
  }
}

function formatMismatch(input: {
  intentMatches: boolean
  changedFieldsMatch: boolean
  unhandledMatches: boolean
  canonical: unknown
  expected: unknown
  changedFields: readonly string[]
  expectedFields: readonly string[]
  unhandled: string | null
  expectedUnhandled: string | null
}): string {
  const failures: string[] = []
  if (!input.intentMatches) {
    failures.push(
      `intent expected ${JSON.stringify(input.expected)}; got ${JSON.stringify(input.canonical)}`,
    )
  }
  if (!input.changedFieldsMatch) {
    failures.push(
      `changed fields expected ${JSON.stringify(input.expectedFields)}; got ${JSON.stringify(input.changedFields)}`,
    )
  }
  if (!input.unhandledMatches) {
    failures.push(
      `unhandled expected ${JSON.stringify(input.expectedUnhandled)}; got ${JSON.stringify(input.unhandled)}`,
    )
  }
  return failures.join(' | ')
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  const index = Math.ceil(sortedValues.length * fraction) - 1
  return sortedValues[Math.max(0, index)] ?? 0
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
