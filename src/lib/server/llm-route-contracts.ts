import { z } from 'zod'
import { explanationFactsSchema } from '../engine/facts-schema'
import { placeSchema, tripIntentSchema } from '../schema/trip-intent'

const MAX_UTTERANCE_CODE_POINTS = 500
const MAX_CITY_CODE_POINTS = 100
const MAX_TEXT_CODE_POINTS = 100

// Defensive transport ceilings are deliberately wider than simulated inventory while
// keeping every number sent to the model finite and operationally bounded.
const NUMERIC_MAXIMA = {
  stops: 10,
  durationMinutes: 7 * 24 * 60,
  priceUsd: 10_000_000,
  comparisonStops: 10,
  comparisonDurationMinutes: 7 * 24 * 60,
  comparisonArrivalMinutes: 7 * 24 * 60,
  comparisonUsd: 10_000_000,
} as const

const boundedCitySchema = boundedString(MAX_CITY_CODE_POINTS)
const boundedPlaceSchema = placeSchema.extend({ city: boundedCitySchema })
const boundedTripIntentSchema = tripIntentSchema.extend({
  origin: boundedPlaceSchema.extend({ assumed: z.boolean() }).nullable(),
  destination: boundedPlaceSchema.nullable(),
})

const intentRequestSchema = z.object({
  currentIntent: boundedTripIntentSchema,
  utterance: boundedString(MAX_UTTERANCE_CODE_POINTS),
})

const boundedExplanationFactsSchema = explanationFactsSchema.superRefine(
  (facts, context) => {
    addCodePointMaximum(
      facts.optionId,
      ['optionId'],
      MAX_TEXT_CODE_POINTS,
      context,
    )
    addMaximum(facts.stops, ['stops'], NUMERIC_MAXIMA.stops, context)
    addMaximum(
      facts.totalDurationMinutes,
      ['totalDurationMinutes'],
      NUMERIC_MAXIMA.durationMinutes,
      context,
    )
    addMaximum(
      facts.price.totalUsd,
      ['price', 'totalUsd'],
      NUMERIC_MAXIMA.priceUsd,
      context,
    )
    addComparisonMaxima(facts.vsCheapest, ['vsCheapest'], context)
    addComparisonMaxima(facts.vsFastest, ['vsFastest'], context)
  },
)

const explanationRequestSchema = z.object({
  facts: boundedExplanationFactsSchema,
})

export function parseIntentRequest(value: unknown) {
  return intentRequestSchema.safeParse(value)
}

export function parseExplanationRequest(value: unknown) {
  return explanationRequestSchema.safeParse(value)
}

type RefinementContext = Parameters<
  Parameters<typeof explanationFactsSchema.superRefine>[0]
>[1]

function boundedString(maxCodePoints: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= maxCodePoints, {
      message: `Must be at most ${maxCodePoints} Unicode code points`,
    })
}

function addCodePointMaximum(
  value: string,
  path: PropertyKey[],
  maximum: number,
  context: RefinementContext,
): void {
  if ([...value].length <= maximum) return
  context.addIssue({
    code: 'custom',
    path,
    message: `Must be at most ${maximum} Unicode code points`,
  })
}

function addMaximum(
  value: number,
  path: PropertyKey[],
  maximum: number,
  context: RefinementContext,
): void {
  if (value <= maximum) return
  context.addIssue({ code: 'custom', path, message: `Must be at most ${maximum}` })
}

function addAbsoluteMaximum(
  value: number,
  path: PropertyKey[],
  maximum: number,
  context: RefinementContext,
): void {
  if (Math.abs(value) <= maximum) return
  context.addIssue({
    code: 'custom',
    path,
    message: `Absolute value must be at most ${maximum}`,
  })
}

function addComparisonMaxima(
  comparison: z.infer<typeof explanationFactsSchema>['vsCheapest'],
  path: PropertyKey[],
  context: RefinementContext,
): void {
  if (!comparison) return
  addAbsoluteMaximum(
    comparison.stopsDelta,
    [...path, 'stopsDelta'],
    NUMERIC_MAXIMA.comparisonStops,
    context,
  )
  addAbsoluteMaximum(
    comparison.durationDeltaMinutes,
    [...path, 'durationDeltaMinutes'],
    NUMERIC_MAXIMA.comparisonDurationMinutes,
    context,
  )
  addAbsoluteMaximum(
    comparison.arrivalDeltaMinutes,
    [...path, 'arrivalDeltaMinutes'],
    NUMERIC_MAXIMA.comparisonArrivalMinutes,
    context,
  )
  addAbsoluteMaximum(
    comparison.totalUsdDelta,
    [...path, 'totalUsdDelta'],
    NUMERIC_MAXIMA.comparisonUsd,
    context,
  )
}
