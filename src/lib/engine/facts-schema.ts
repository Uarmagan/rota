import { z } from 'zod'
import type { AwardPriceDisplay, ExplanationFacts, OptionComparison } from './types'

const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

const awardPriceDisplaySchema: z.ZodType<AwardPriceDisplay> = z.object({
  totalMiles: z.number().int().nonnegative(),
  totalFeesUsd: z.number().int().nonnegative(),
  program: z.string().min(1),
})

const optionComparisonSchema: z.ZodType<OptionComparison> = z.object({
  stopsDelta: z.number().int(),
  durationDeltaMinutes: z.number().int(),
  arrivalDeltaMinutes: z.number().int(),
  totalMilesDelta: z.number().int(),
})

export const explanationFactsSchema: z.ZodType<ExplanationFacts> = z.object({
  optionId: z.string().min(1),
  stops: z.number().int().nonnegative(),
  totalDurationMinutes: z.number().int().positive(),
  price: awardPriceDisplaySchema,
  isBestMatch: z.boolean(),
  isCheapest: z.boolean(),
  isFastest: z.boolean(),
  arriveBy: localTime.nullable(),
  nonstopRequired: z.boolean(),
  vsCheapest: optionComparisonSchema.nullable(),
  vsFastest: optionComparisonSchema.nullable(),
})
