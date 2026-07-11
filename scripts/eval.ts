import { isDeepStrictEqual } from 'node:util'
import { computeIntentDiff } from '../src/lib/engine/diff'
import { canonicalizePlaces } from '../src/lib/engine/normalize'
import { parserFixtures, type ParserFixture } from '../src/lib/parser/fixtures'
import { OpenAIIntentParser } from '../src/lib/parser/openai-intent-parser'

interface EvalOptions {
  reps: number
  model?: string
  fixture?: string
}

interface RepResult {
  correct: boolean
  retried: boolean
  latencyMs: number
  softWordingHit: boolean | null
}

interface ScorecardRow {
  fixture: string
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
  const fixtures = options.fixture
    ? parserFixtures.filter((fixture) => fixture.name === options.fixture)
    : parserFixtures

  if (fixtures.length === 0) throw new Error(`Unknown fixture: ${options.fixture}`)

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
    const required =
      fixture.kind === 'hostile' ? options.reps : Math.ceil(options.reps * 0.8)
    const passed = correct >= required
    if (passed) passingFixtures += 1
    passingReps += correct
    totalReps += results.length

    const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b)
    const wordingChecks = results.filter((result) => result.softWordingHit !== null)
    const wordingHits = wordingChecks.filter((result) => result.softWordingHit).length
    rows.push({
      fixture: fixture.name,
      result: passed ? 'PASS' : 'FAIL',
      passRate: `${correct}/${results.length}`,
      retryRate: `${results.filter((result) => result.retried).length}/${results.length}`,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      softWording:
        wordingChecks.length === 0 ? 'n/a' : `${wordingHits}/${wordingChecks.length}`,
    })
  }

  console.table(rows)
  const overall = passingFixtures === fixtures.length ? 'PASS' : 'FAIL'
  console.log(
    `Overall: ${overall} | ` +
      `model: ${options.model ?? process.env.ROTA_MODEL ?? 'gpt-5.6-luna'} | ` +
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
    const unhandledNullnessMatches =
      (result.unhandled === null) === (fixture.expectedUnhandled === null)

    return {
      correct:
        isDeepStrictEqual(canonical, fixture.expected) &&
        isDeepStrictEqual(changedFields, expectedFields) &&
        unhandledNullnessMatches,
      retried: parser.lastAttemptCount > 1,
      latencyMs: Math.round(performance.now() - started),
      softWordingHit: wordingHit(result.unhandled, fixture.expectedUnhandled),
    }
  } catch {
    return {
      correct: false,
      retried: parser.lastAttemptCount > 1,
      latencyMs: Math.round(performance.now() - started),
      softWordingHit: null,
    }
  }
}

function wordingHit(actual: string | null, expected: string | null): boolean | null {
  if (actual === null || expected === null) return null
  const normalizedActual = actual.toLocaleLowerCase()
  const normalizedExpected = expected.toLocaleLowerCase()
  return (
    normalizedActual.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedActual)
  )
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  const index = Math.ceil(sortedValues.length * fraction) - 1
  return sortedValues[Math.max(0, index)] ?? 0
}

function parseArgs(args: readonly string[]): EvalOptions {
  const options: EvalOptions = { reps: 5 }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--') continue
    const value = args[index + 1]
    if (!value) throw new Error(`Missing value for ${flag}`)

    if (flag === '--reps') {
      const reps = Number(value)
      if (!Number.isInteger(reps) || reps < 1) {
        throw new Error('--reps must be a positive integer')
      }
      options.reps = reps
    } else if (flag === '--model') {
      options.model = value
    } else if (flag === '--fixture') {
      options.fixture = value
    } else {
      throw new Error(`Unknown argument: ${flag}`)
    }
    index += 1
  }
  return options
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
