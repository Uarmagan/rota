import { describe, expect, it } from 'vitest'
import { computeIntentDiff } from '../engine/diff'
import { checkGaps } from '../engine/gaps'
import { canonicalizePlaces } from '../engine/normalize'
import { tripIntentSchema } from '../schema/trip-intent'
import { parserFixtures } from './fixtures'

// Self-consistency of the fixture data itself — runs without any LLM. The live-model
// eval script reuses the same assertions against real parser output.

describe.each(parserFixtures.map((f) => [f.name, f] as const))(
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
        // unhandled, the follow-up absorbs it — its question echoes the clause rather
        // than deferring it invisibly (D5).
        expect(outcome).toMatchObject({
          kind: 'follow_up',
          reason: 'missing_destination',
        })
        if (fixture.expectedUnhandled !== null && outcome.kind === 'follow_up') {
          expect(outcome.question).toContain(fixture.expectedUnhandled)
        }
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
