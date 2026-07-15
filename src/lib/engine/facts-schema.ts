import { z } from 'zod'
import type { ExplanationFacts, OptionComparison, PriceDisplay } from './types'

const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

const priceDisplaySchema: z.ZodType<PriceDisplay> = z.object({
  totalUsd: z.number().int().nonnegative(),
})

const optionComparisonSchema: z.ZodType<OptionComparison> = z.object({
  stopsDelta: z.number().int(),
  durationDeltaMinutes: z.number().int(),
  arrivalDeltaMinutes: z.number().int(),
  totalUsdDelta: z.number().int(),
})

export const explanationFactsSchema: z.ZodType<ExplanationFacts> = z.object({
  optionId: z.string().min(1),
  stops: z.number().int().nonnegative(),
  totalDurationMinutes: z.number().int().positive(),
  price: priceDisplaySchema,
  isBestMatch: z.boolean(),
  isCheapest: z.boolean(),
  isFastest: z.boolean(),
  arriveBy: localTime.nullable(),
  nonstopRequired: z.boolean(),
  vsCheapest: optionComparisonSchema.nullable(),
  vsFastest: optionComparisonSchema.nullable(),
})
