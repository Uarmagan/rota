import { z } from 'zod'

// This schema is the contract of LLM boundary #1: the parser re-emits the COMPLETE
// TripIntent on every utterance. Absent/unstated fields are null, never omitted —
// AI SDK v6 strict JSON schema mode requires .nullable(), not .optional().
//
// The .refine checks below do not survive conversion to the JSON schema the model
// sees; they run in the post-parse Zod gate, where failures trigger the
// response-healing/retry path.

export const CABINS = ['economy', 'premium_economy', 'business', 'first'] as const
export const cabinSchema = z.enum(CABINS)
export type Cabin = z.infer<typeof cabinSchema>

// Shape-only gate. Registry membership and the code-city pairing are enforced by the
// deterministic canonicalizePlaces step in src/lib/engine against schema/places.ts.
const iataSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'three-letter uppercase IATA code')

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO date, YYYY-MM-DD')
  .refine(isRealCalendarDate, 'must be a real calendar date')

// 24h local clock time. arriveBy is local at the destination, departAfter local at
// the origin. These are daytime-deadline constraints ("land by 5pm", "nothing before
// 9am") compared as time-of-day; small-hours arrivals ("nothing that lands after
// midnight") are constraints.avoidLateArrival, because clock-time comparison cannot
// express crossing midnight.
const localTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, '24h local time, HH:MM')

export const placeSchema = z.object({
  iata: iataSchema,
  city: z.string().min(1),
})
export type Place = z.infer<typeof placeSchema>

// assumed: true means the user never stated an origin. The parser NEVER sets this
// from nothing — it leaves origin null and the engine's fillAssumptions step fills it
// from configured defaults. Once filled it lives in chip state, and the parser edits
// it like any other field: "actually from SFO" replaces it, a confirmation flips
// assumed to false.
export const originSchema = placeSchema.extend({
  assumed: z.boolean(),
})
export type Origin = z.infer<typeof originSchema>

// 'exact': the user named a specific day (earliest === latest).
// 'flexible': any departure inside the window works ("in february", "mid-March").
export const dateWindowSchema = z
  .object({
    earliest: isoDateSchema,
    latest: isoDateSchema,
    flexibility: z.enum(['exact', 'flexible']),
  })
  .refine((w) => w.earliest <= w.latest, 'earliest must be on or before latest')
  .refine(
    (w) => w.flexibility !== 'exact' || w.earliest === w.latest,
    "flexibility 'exact' requires earliest === latest",
  )
export type DateWindow = z.infer<typeof dateWindowSchema>

// 'required' filters, 'preferred' only boosts ranking ("nonstop if possible").
export const nonstopSchema = z.enum(['required', 'preferred'])
export type Nonstop = z.infer<typeof nonstopSchema>

// Every constraint is tri-state: null = never stated, a value = stated, and for the
// booleans, false = user explicitly waived it ("red-eyes are fine"). Constraint
// removal ("forget the nonstop thing") is re-emission with the field back to null.
//
// avoidRedeye: departure in the engine-defined late-night window.
// avoidLateArrival: arrival in the engine-defined small-hours window (00:00–05:00
// local) — "nothing that lands after midnight".
export const constraintsSchema = z.object({
  nonstop: nonstopSchema.nullable(),
  arriveBy: localTimeSchema.nullable(),
  departAfter: localTimeSchema.nullable(),
  avoidRedeye: z.boolean().nullable(),
  avoidLateArrival: z.boolean().nullable(),
})
export type Constraints = z.infer<typeof constraintsSchema>

export const tripIntentSchema = z.object({
  // Occupied seats — what availability must find and pricing must multiply.
  travelers: z.number().int().min(1).max(9).nullable(),
  origin: originSchema.nullable(),
  destination: placeSchema.nullable(),
  cabin: cabinSchema.nullable(),
  dates: dateWindowSchema.nullable(),
  constraints: constraintsSchema,
})
export type TripIntent = z.infer<typeof tripIntentSchema>

export function createEmptyTripIntent(): TripIntent {
  return {
    travelers: null,
    origin: null,
    destination: null,
    cabin: null,
    dates: null,
    constraints: {
      nonstop: null,
      arriveBy: null,
      departAfter: null,
      avoidRedeye: null,
      avoidLateArrival: null,
    },
  }
}

function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}
