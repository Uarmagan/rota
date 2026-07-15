import type { ParserFixture } from '../src/lib/parser/fixtures'

export interface EvalOptions {
  reps: number
  model?: string
  fixture?: string
  challengeOnly: boolean
}

const MIN_CHALLENGE_REPS = 5

export function selectFixtures(
  fixtures: readonly ParserFixture[],
  options: EvalOptions,
): readonly ParserFixture[] {
  const namedFixtures = options.fixture
    ? fixtures.filter((fixture) => fixture.name === options.fixture)
    : fixtures

  if (namedFixtures.length === 0) throw new Error(`Unknown fixture: ${options.fixture}`)

  const selected = options.challengeOnly
    ? namedFixtures.filter((fixture) => fixture.challenge)
    : namedFixtures

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
  return actual !== null && containsExpectedPhrase(actual, expected)
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

function normalizedTokens(value: string): readonly string[] {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}
