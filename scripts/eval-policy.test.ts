import { describe, expect, it } from 'vitest'
import {
  parserEvaluationCases,
  parserFixtures,
} from '../src/lib/parser/fixtures'
import {
  parseArgs,
  requiredCorrectReps,
  selectEvaluationCases,
  unhandledMatches,
  validateFixtureRun,
  wordingHit,
} from './eval-policy'

describe('eval policy', () => {
  it('parses the challenge suite flag and repetition count', () => {
    expect(parseArgs(['--', '--challenge', '--reps', '5'])).toEqual({
      reps: 5,
      challengeOnly: true,
    })
  })

  it('selects only challenge fixtures when requested', () => {
    const fixtures = selectEvaluationCases(parserEvaluationCases, {
      reps: 5,
      challengeOnly: true,
    })

    expect(fixtures).toEqual(
      parserEvaluationCases.filter((fixture) => fixture.challenge),
    )
    expect(fixtures.every((fixture) => fixture.challenge)).toBe(true)
  })

  it('selects a canonical fixture with its variants or one expanded case exactly', () => {
    const family = selectEvaluationCases(parserEvaluationCases, {
      reps: 5,
      fixture: 'named-travelers-telegraphic',
      challengeOnly: false,
    })
    expect(family.map((fixture) => fixture.name)).toEqual([
      'named-travelers-telegraphic',
      'named-travelers-telegraphic::no-punctuation',
      'named-travelers-telegraphic::reordered-fragments',
    ])

    const expanded = selectEvaluationCases(parserEvaluationCases, {
      reps: 5,
      fixture: 'named-travelers-telegraphic::no-punctuation',
      challengeOnly: false,
    })
    expect(expanded.map((fixture) => fixture.name)).toEqual([
      'named-travelers-telegraphic::no-punctuation',
    ])
  })

  it('requires all challenge and hostile reps but only 80% of ordinary reps', () => {
    const challenge = evaluationCase('named-travelers-telegraphic::no-punctuation')
    const hostile = evaluationCase('hostile-gibberish')
    const ordinary = evaluationCase('lazy-first-query')

    expect(requiredCorrectReps(challenge, 5)).toBe(5)
    expect(requiredCorrectReps(hostile, 5)).toBe(5)
    expect(requiredCorrectReps(ordinary, 5)).toBe(4)
  })

  it('rejects challenge runs below the five-rep acceptance floor', () => {
    const challenge = evaluationCase('named-travelers-telegraphic::no-punctuation')

    expect(() => validateFixtureRun([challenge], 4)).toThrow(
      'Challenge fixtures require at least 5 reps',
    )
    expect(() => validateFixtureRun([challenge], 5)).not.toThrow()
    expect(() => validateFixtureRun([evaluationCase('lazy-first-query')], 1)).not.toThrow()
  })

  it('requires the complete expected unhandled phrase for challenge fixtures', () => {
    const place = fixture('qualified-unsupported-place')
    const seat = fixture('party-join-plus-unhandled')

    expect(unhandledMatches(place, 'PARIS, TEXAS!')).toBe(true)
    expect(unhandledMatches(place, 'Texas')).toBe(false)
    expect(unhandledMatches(seat, 'AISLE, SEAT!')).toBe(true)
    expect(unhandledMatches(seat, 'seat')).toBe(false)
    expect(unhandledMatches(seat, 'please aisle seat')).toBe(false)
    expect(unhandledMatches(seat, 'aisle seat please')).toBe(false)
    expect(
      unhandledMatches(seat, 'aisle seat and a 20 minute limousine'),
    ).toBe(false)
  })

  it('keeps wording diagnostic-only for ordinary fixtures', () => {
    expect(unhandledMatches(fixture('unsupported-city'), 'a different city')).toBe(true)
    expect(wordingHit('please aisle seat', 'aisle seat')).toBe(true)
  })
})

function fixture(name: string) {
  const match = parserFixtures.find((candidate) => candidate.name === name)
  if (!match) throw new Error(`Missing fixture: ${name}`)
  return match
}

function evaluationCase(name: string) {
  const match = parserEvaluationCases.find((candidate) => candidate.name === name)
  if (!match) throw new Error(`Missing evaluation case: ${name}`)
  return match
}
