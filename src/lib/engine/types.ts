import type { Cabin } from '../schema/trip-intent'

// The M2/M3 seam: FlightOption is what the availability simulation emits and the
// engine consumes. Two load-bearing rules:
//
// 1. All times are LOCAL wall-clock ISO minutes ('YYYY-MM-DDTHH:MM') at the named
//    airport. There is NO timezone math anywhere in the system — total duration is
//    carried explicitly and the engine never derives duration from timestamps.
//    Differencing two stamps is only meaningful at the same airport.
// 2. FlightOption carries raw pricing INPUTS; engine/pricing.ts computes every
//    display total. The generator never emits a party total.
//
// Generator contracts the engine trusts (filter asserts them cheaply, never
// re-filters): options are generated for the searched route and date window, and a
// provider only emits options that can seat the whole party — seat scarcity lives in
// the generator, so there is no seats field here.

export interface FlightSegment {
  from: string // IATA code, a registry member
  to: string
  departLocal: string // 'YYYY-MM-DDTHH:MM' local at `from`
  arriveLocal: string // 'YYYY-MM-DDTHH:MM' local at `to`
  flight: string // display identity; engine logic never reads it
}

export interface CashPricingInputs {
  priceUsd: number // one traveler, whole USD; cabin already reflected
}

export interface FlightOption {
  id: string // stable within a seeded run; the deterministic rank tie-breaker
  source: string // availability source id
  cabin: Cabin
  segments: readonly FlightSegment[] // >= 1; stops = segments.length - 1
  totalDurationMinutes: number
  pricing: CashPricingInputs
}

// Party display totals, computed by engine/pricing.ts from CashPricingInputs.
// The ONLY numbers pricing ever surfaces — the UI formats, never computes.
export interface PriceDisplay {
  totalUsd: number
}

// Deltas of one option against a reference option in the same result set.
// Every delta is `this minus reference`: positive stopsDelta = more stops,
// negative durationDeltaMinutes = faster, negative arrivalDeltaMinutes = lands
// earlier (final-arrival wall-clock at the shared destination), negative
// totalUsdDelta = lower party price. arrivalDeltaMinutes is null when the two
// options depart on different local days: under a flexible date window the gap
// is an artifact of which days were sampled, not a fact about the flights.
export interface OptionComparison {
  stopsDelta: number
  durationDeltaMinutes: number
  arrivalDeltaMinutes: number | null
  totalUsdDelta: number
}

// The only raw material the prose boundary may phrase (number-provenance
// invariant: if the engine didn't compute it, the copy can't say it). Minimal and
// per-result on purpose — claim-binding correctness comes from there being nothing
// here to misattribute. Computed within the current FILTERED set, so isFastest
// already means "fastest under the active constraints".
export interface ExplanationFacts {
  optionId: string
  stops: number
  totalDurationMinutes: number
  price: PriceDisplay
  isBestMatch: boolean
  isCheapest: boolean // by per-traveler cash price
  isFastest: boolean
  arriveBy: string | null // the active arrive-by deadline, for phrasing context
  nonstopRequired: boolean
  vsCheapest: OptionComparison | null // null when this option IS the cheapest
  vsFastest: OptionComparison | null // null when this option IS the fastest
}
