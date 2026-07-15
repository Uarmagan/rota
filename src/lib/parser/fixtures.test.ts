import { describe, expect, it } from 'vitest'
import { computeIntentDiff } from '../engine/diff'
import { checkGaps } from '../engine/gaps'
import { canonicalizePlaces } from '../engine/normalize'
import { tripIntentSchema } from '../schema/trip-intent'
import {
  expandParserFixtures,
  parserEvaluationCases,
  parserFixtureCounts,
  parserFixtures,
} from './fixtures'

// Self-consistency of the fixture data itself — runs without any LLM. The live-model
// eval script reuses the same assertions against real parser output.

describe('fixture expansion', () => {
  it('expands variants in stable order without changing fixture expectations', () => {
    const base = parserFixtures[0]
    const expanded = expandParserFixtures([
      {
        ...base,
        variants: [
          { name: 'short', utterance: 'tokyo next february' },
          { name: 'polite', utterance: 'Tokyo in February, please' },
        ],
      },
    ])

    expect(expanded.map((fixture) => fixture.name)).toEqual([
      base.name,
      `${base.name}::short`,
      `${base.name}::polite`,
    ])
    expect(expanded.map((fixture) => fixture.canonicalName)).toEqual([
      base.name,
      base.name,
      base.name,
    ])
    for (const fixture of expanded) {
      expect(fixture.context).toBe(base.context)
      expect(fixture.currentIntent).toBe(base.currentIntent)
      expect(fixture.expected).toBe(base.expected)
      expect(fixture.expectedUnhandled).toBe(base.expectedUnhandled)
      expect(fixture.expectedChangedFields).toBe(base.expectedChangedFields)
    }
  })

  it('publishes unique expanded names in canonical fixture order', () => {
    const names = parserEvaluationCases.map((fixture) => fixture.name)
    expect(new Set(names).size).toBe(names.length)
    expect(parserEvaluationCases[0].name).toBe(parserFixtures[0].name)
  })

  it('keeps the documented corpus and challenge counts deterministic', () => {
    expect(parserFixtureCounts).toEqual({
      canonical: 47,
      expanded: 59,
      challengeCanonical: 19,
      challengeExpanded: 31,
    })
  })

  it('maintains six curated positive families with at least two variants each', () => {
    const familyNames = [
      'named-travelers-telegraphic',
      'place-like-person-names',
      'quantified-family-party',
      'named-party-self-correction',
      'party-join-plus-unhandled',
      'compressed-itinerary-shorthand',
    ]
    for (const name of familyNames) {
      const fixture = parserFixtures.find((candidate) => candidate.name === name)
      expect(fixture?.variants?.length, name).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps five role-and-count minimal pairs as standalone strict cases', () => {
    const names = [
      'named-spouse-counted-once',
      'recommender-excluded-from-party',
      'person-at-destination-not-traveling',
      'place-names-without-travel-grammar',
      'unquantified-family-preserves-null',
    ]
    for (const name of names) {
      const fixture = parserFixtures.find((candidate) => candidate.name === name)
      expect(fixture?.challenge, name).toBe(true)
      expect(fixture?.variants, name).toBeUndefined()
    }
  })
})

describe.each(parserEvaluationCases.map((f) => [f.name, f] as const))(
  'fixture %s',
  (_name, fixture) => {
    it('currentIntent and expected both pass the schema gate', () => {
      expect(tripIntentSchema.safeParse(fixture.currentIntent).success).toBe(true)
      expect(tripIntentSchema.safeParse(fixture.expected).success).toBe(true)
    })

    it('expected is already canonical (registry places, canonical labels)', () => {
      expect(canonicalizePlaces(fixture.expected)).toEqual(fixture.expected)
      expect(canonicalizePlaces(fixture.currentIntent)).toEqual(fixture.currentIntent)
    })

    it('diff(currentIntent, expected) touches exactly expectedChangedFields', () => {
      const fields = computeIntentDiff(fixture.currentIntent, fixture.expected).map(
        (c) => c.field,
      )
      expect([...fields].sort()).toEqual([...fixture.expectedChangedFields].sort())
    })

    it('expectedUnhandled is null or a non-empty string', () => {
      expect(
        typeof fixture.expectedUnhandled === 'string'
          ? fixture.expectedUnhandled.length > 0
          : fixture.expectedUnhandled === null,
      ).toBe(true)
    })

    it('checkGaps matches the fixture destination/unhandled state', () => {
      const outcome = checkGaps(fixture.expected, fixture.expectedUnhandled)
      if (!fixture.expected.destination) {
        // Missing destination blocks and is adjudicated first. When a clause also went
        // unhandled, the follow-up carries it — the echo renders beside the destination
        // prompt chip rather than being deferred invisibly (D5).
        expect(outcome).toEqual({
          kind: 'follow_up',
          reason: 'missing_destination',
          unhandled: fixture.expectedUnhandled,
        })
      } else if (fixture.expectedUnhandled !== null) {
        expect(outcome).toEqual({
          kind: 'ready_with_notice',
          unhandled: fixture.expectedUnhandled,
        })
      } else {
        expect(outcome).toEqual({ kind: 'ready' })
      }
    })
  },
)
