import type {
  ParserEvaluationCase,
  ParserFixture,
} from '../src/lib/parser/fixtures'

export interface EvalOptions {
  reps: number
  model?: string
  fixture?: string
  challengeOnly: boolean
}

const MIN_CHALLENGE_REPS = 5

export function selectEvaluationCases(
  cases: readonly ParserEvaluationCase[],
  options: EvalOptions,
): readonly ParserEvaluationCase[] {
  const canonicalMatches = options.fixture
    ? cases.filter(
        (evaluationCase) => evaluationCase.canonicalName === options.fixture,
      )
    : []
  const namedCases = options.fixture
    ? canonicalMatches.length > 0
      ? canonicalMatches
      : cases.filter((evaluationCase) => evaluationCase.name === options.fixture)
    : cases

  if (namedCases.length === 0) throw new Error(`Unknown fixture: ${options.fixture}`)

  const selected = options.challengeOnly
    ? namedCases.filter((evaluationCase) => evaluationCase.challenge)
    : namedCases

  if (selected.length === 0) throw new Error('No challenge fixtures matched')
  return selected
}

export function validateFixtureRun(
  fixtures: readonly ParserFixture[],
  reps: number,
): void {
  if (reps < MIN_CHALLENGE_REPS && fixtures.some((fixture) => fixture.challenge)) {
    throw new Error(
      `Challenge fixtures require at least ${MIN_CHALLENGE_REPS} reps`,
    )
  }
}

export function requiredCorrectReps(fixture: ParserFixture, reps: number): number {
  return requiresPerfectRun(fixture) ? reps : Math.ceil(reps * 0.8)
}

export function requiresPerfectRun(fixture: ParserFixture): boolean {
  return fixture.kind === 'hostile' || fixture.challenge === true
}

export function unhandledMatches(
  fixture: ParserFixture,
  actual: string | null,
): boolean {
  const expected = fixture.expectedUnhandled
  if ((actual === null) !== (expected === null)) return false
  if (!fixture.challenge || expected === null) return true
  return actual !== null && normalizedPhrasesEqual(actual, expected)
}

export function wordingHit(
  actual: string | null,
  expected: string | null,
): boolean | null {
  if (actual === null || expected === null) return null
  return containsExpectedPhrase(actual, expected) || containsExpectedPhrase(expected, actual)
}

export function parseArgs(args: readonly string[]): EvalOptions {
  const options: EvalOptions = { reps: 5, challengeOnly: false }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--') continue
    if (flag === '--challenge') {
      options.challengeOnly = true
      continue
    }
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

function containsExpectedPhrase(actual: string, expected: string): boolean {
  const actualTokens = normalizedTokens(actual)
  const expectedTokens = normalizedTokens(expected)
  if (expectedTokens.length === 0 || expectedTokens.length > actualTokens.length) {
    return false
  }

  for (let start = 0; start <= actualTokens.length - expectedTokens.length; start += 1) {
    if (
      expectedTokens.every(
        (token, offset) => actualTokens[start + offset] === token,
      )
    ) {
      return true
    }
  }
  return false
}

function normalizedPhrasesEqual(actual: string, expected: string): boolean {
  const actualTokens = normalizedTokens(actual)
  const expectedTokens = normalizedTokens(expected)
  return (
    actualTokens.length > 0 &&
    actualTokens.length === expectedTokens.length &&
    actualTokens.every((token, index) => token === expectedTokens[index])
  )
}

function normalizedTokens(value: string): readonly string[] {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}
