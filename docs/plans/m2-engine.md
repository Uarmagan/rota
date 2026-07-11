# M2 — Engine completion: implementation plan

Self-contained plan for the M2 milestone (ROADMAP.md §M2). All design decisions below
are FINAL — they were resolved in a design session on 2026-07-10. Do not reopen them;
implement exactly as specified. Read PRD.md, ARCHITECTURE.md, CONTEXT.md, and
CLAUDE.md before starting; their invariants bind everything here.

A second agent is implementing M3 (the availability simulation) in the same working
tree, concurrently. The file-footprint constraint below is what keeps you from
colliding — treat it as absolute.

## Hard constraints (from CLAUDE.md / ARCHITECTURE.md — violations fail review)

- **File footprint: create/edit ONLY files under `src/lib/engine/`.** Do NOT touch
  ROADMAP.md, CONTEXT.md, ARCHITECTURE.md, CLAUDE.md, `src/lib/import-boundaries.test.ts`,
  `package.json`, anything under `src/lib/schema/`, `src/lib/parser/`, or any other
  path. Doc updates happen at review, by the operator.
- **Engine purity**: files under `src/lib/engine` import only `zod`, `src/lib/schema`,
  and other engine files (test files may additionally import `vitest`). Enforced by
  `src/lib/import-boundaries.test.ts`, which you must leave untouched and green. No
  `Date.now`, no `Math.random`, no I/O, no env reads — fully deterministic.
  (`Date.UTC` over fixed string inputs is deterministic and permitted.)
- The schema in `src/lib/schema/` is FROZEN. Never change shapes; never edit those
  files at all (file footprint).
- No number shown to a user may originate from an LLM. Everything this milestone
  computes (prices, deltas, superlatives) exists to make that invariant satisfiable:
  ExplanationFacts is the ONLY raw material the future prose module may phrase.
  Rank scores are engine-internal and must never render.
- Package manager: pnpm. Never npm/yarn. Do not run `pnpm dev` or `pnpm build`.
  Verify with `pnpm typecheck` and `pnpm test`. Do not commit.
- Never `any`. TypeScript stays 5.x strict. Comments sparse; only genuinely
  non-obvious decisions.
- No mocks in engine tests — plain Vitest over pure functions is the point of the
  purity constraint.

## Locked decisions (context for why the specs look the way they do)

| # | Decision |
|---|---|
| 1 | `src/lib/engine/types.ts` is the M2/M3 seam and its complete source is specified below (work item 1). It is types-only (zero runtime code). **It may already exist when you start** — it was created at plan-reconciliation time. If so, build against it exactly as-is and do not redefine or edit it. |
| 2 | All times are LOCAL wall-clock ISO minutes (`'YYYY-MM-DDTHH:MM'`) at the named airport. NO timezone math anywhere: total duration is carried explicitly on `FlightOption` and the engine never derives duration from timestamps. Differencing two stamps is legal only at the same airport (same local clock) — used exactly once, for arrival-vs-arrival deltas at the shared destination. |
| 3 | Red-eye = FIRST segment's departure time-of-day in **[22:00, 05:00)** local (wraps midnight; 22:00 is a red-eye, 05:00 is not). Matches the colloquial meaning — the journey leaves late at night; connection-time comfort is out of scope. Small-hours arrival (already fixed by CONTEXT.md) = FINAL arrival time-of-day in **[00:00, 05:00)** local. |
| 4 | `arriveBy` / `departAfter` are daytime deadlines compared as time-of-day, inclusive: final arrival ≤ deadline, first departure ≥ threshold. A 00:30 arrival passes `arriveBy: '17:00'` — that is BY DESIGN (clock-time comparison cannot express crossing midnight; `avoidLateArrival` exists for exactly that). Do not "fix" it. |
| 5 | Cabin filter is exact equality: `option.cabin === intent.cabin`. No "or better" — an award search for business showing first-class rows would break the legibility of both ranking and the why-this-result copy. `intent.cabin === null` means no cabin gate (unreachable in the real pipeline once defaults are filled, decision 11). |
| 6 | Travelers vs availability: `FlightOption` has NO seats field. The generator contract (M3) is that a provider only emits options that can seat the whole party — seat scarcity lives in the generator. Filter ignores `travelers`; pricing multiplies by it. |
| 7 | Date/route filtering: the engine TRUSTS the generator (options are generated for the searched route and window) and does not re-filter. It cheaply asserts the contract instead: route endpoints and first-departure date are checked when the corresponding intent field is non-null, and a violation throws `GeneratorContractError` — a wiring bug should fail loudly in tests, same style as `UnknownPlaceError` in normalize.ts. |
| 8 | One price scalar everywhere: `milesEquivalent = baseMiles + feesUsd × 80` (80 miles per USD ≈ 1.25¢/mile — fictional but fixed; only relative order matters). Rank's price term and explain's "cheapest" superlative both use it, so the cheapest-priority winner and the "cheapest" the prose names can never disagree. Per-traveler: the party multiplier is constant across options and cannot affect order. |
| 9 | Scoring is per-option and set-independent (lower = better): `score = priceW·(milesEquivalent/10000) + durW·(hours) + 1.0·stops + preferredPenalty`. Base weights priceW = 1.0, durW = 0.5. `priority` triples its axis (cheapest → priceW 3.0; fastest → durW 1.5) and never filters (ADR 0001). `nonstop: 'preferred'` adds a flat +2.0 to any option with ≥ 1 stop; `'required'` is filter's job. Tie-break: ascending `id` (code-unit `<`, not localeCompare). |
| 10 | "Stable under incremental batches" means: `rankOptions` is a pure function of the option SET. Because scores are set-independent, an option's score never changes as batches land — new options merely insert, and the relative order of already-ranked options is preserved. Tests assert permutation invariance, incremental-merge ≡ full-set rank, and order preservation across a merge. |
| 11 | `fillDefaults` lands in `normalize.ts` per ADR 0004 and the D4 note in ROADMAP.md ("the defaulting code lands with the M2 engine/normalization"): unstated cabin → `'economy'`, unstated travelers → `1`, applied at pipeline step 3 alongside `fillAssumptions`. Defaults are plain visible chips, never flagged "(assumed)". |
| 12 | `ExplanationFacts` is minimal and per-result (ARCHITECTURE.md's claim-binding note): identity numbers, party price, three superlative flags, active-constraint context, and comparisons against exactly two reference options — the set's cheapest and the set's fastest. All deltas are `this minus reference`. Computed within the current FILTERED set, so "fastest" already means "fastest under your constraints". |
| 13 | Best match = `rankOptions(...)[0]`. The badge's movement across batches is the UI's animation problem; the engine just re-ranks the union. |

---

## Work item 1 — `src/lib/engine/types.ts`

**If this file already exists, skip this item entirely and build against it as-is.**
Otherwise create it with exactly this content:

```ts
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
}

export interface AwardPricingInputs {
  baseMiles: number // one-traveler miles; cabin already reflected
  feesUsd: number // one-traveler taxes/fees, whole USD
  program: string // fictional program name
}

export interface FlightOption {
  id: string // stable within a seeded run; the deterministic rank tie-breaker
  source: string // availability source id
  cabin: Cabin
  segments: readonly FlightSegment[] // >= 1; stops = segments.length - 1
  totalDurationMinutes: number
  pricing: AwardPricingInputs
}

// Party display totals, computed by engine/pricing.ts from AwardPricingInputs.
// The ONLY numbers pricing ever surfaces — the UI formats, never computes.
export interface AwardPriceDisplay {
  totalMiles: number
  totalFeesUsd: number
  program: string
}

// Deltas of one option against a reference option in the same result set.
// Every delta is `this minus reference`: positive stopsDelta = more stops,
// negative durationDeltaMinutes = faster, negative arrivalDeltaMinutes = lands
// earlier (final-arrival wall-clock at the shared destination), negative
// totalMilesDelta = fewer party miles.
export interface OptionComparison {
  stopsDelta: number
  durationDeltaMinutes: number
  arrivalDeltaMinutes: number
  totalMilesDelta: number
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
  price: AwardPriceDisplay
  isBestMatch: boolean
  isCheapest: boolean // by milesEquivalent, the engine's single price scalar
  isFastest: boolean
  arriveBy: string | null // the active arrive-by deadline, for phrasing context
  nonstopRequired: boolean
  vsCheapest: OptionComparison | null // null when this option IS the cheapest
  vsFastest: OptionComparison | null // null when this option IS the fastest
}
```

## Work item 2 — `src/lib/engine/clock.ts`

Local wall-clock helpers shared by filter and explain. Exact exports:

```ts
// Minutes since local midnight for a 'YYYY-MM-DDTHH:MM' stamp.
export function timeOfDayMinutes(local: string): number

// Absolute minutes for a 'YYYY-MM-DDTHH:MM' stamp, treating it as if UTC.
// Valid ONLY for differencing two stamps at the same airport (same local clock);
// never mix airports. Implement via Date.UTC over the parsed components —
// deterministic, no timezone involved.
export function wallClockMinutes(local: string): number

// The 'YYYY-MM-DD' date part.
export function datePart(local: string): string
```

Malformed input is a programmer error; a simple regex parse that throws on mismatch
is fine. Small direct test file `clock.test.ts`: each helper, plus a cross-midnight
difference (e.g. `2027-02-01T23:50` → `2027-02-02T04:10` is 260 minutes).

## Work item 3 — `src/lib/engine/test-support.ts`

A builder so engine tests stay terse. Not a test file (must not import vitest);
imports only `./types` (and schema types if needed).

```ts
export function makeOption(overrides?: Partial<FlightOption>): FlightOption
```

Defaults: a single-segment economy SFO→NRT option (`id: 'opt-1'`, `source: 'src-a'`,
depart `2027-02-10T10:00`, arrive `2027-02-11T14:00`, `totalDurationMinutes: 660`,
pricing `{ baseMiles: 60000, feesUsd: 40, program: 'Aurora Miles' }`). Spreading
`overrides` last is enough; tests that need multi-segment options pass full
`segments` arrays. Add a convenience `makeIntent(overrides?: Partial<TripIntent>)`
wrapping `createEmptyTripIntent()` from schema.

## Work item 4 — defaults in `src/lib/engine/normalize.ts`

Per ADR 0004 / ROADMAP D4 (decision 11). Add to the existing file — do not disturb
`canonicalizePlaces` / `fillAssumptions`:

```ts
export const DEFAULT_CABIN: Cabin = 'economy'
export const DEFAULT_TRAVELERS = 1

// Pipeline step 3, beside fillAssumptions: safe near-universal fallbacks, rendered
// as plain editable chips — visible but never flagged "(assumed)". See docs/adr/0004.
export function fillDefaults(intent: TripIntent): TripIntent
```

Fills `cabin ?? DEFAULT_CABIN` and `travelers ?? DEFAULT_TRAVELERS`; touches nothing
else; returns a new object (house style — see the existing functions). Extend
`normalize.test.ts` with a `fillDefaults` describe block: fills both nulls, preserves
stated values, leaves every other field (including `origin: null`) untouched.

## Work item 5 — `src/lib/engine/pricing.ts`

Award pricing display math from generator-provided raw inputs. Exact exports:

```ts
export const FEES_MILES_PER_USD = 80 // ≈1.25¢/mile; fictional but fixed (decision 8)

// The engine's single price scalar (per-traveler). Rank's price term and explain's
// "cheapest" both use this, so they can never disagree.
export function milesEquivalent(pricing: AwardPricingInputs): number

// Party display totals: per-traveler inputs × travelers. No rounding — inputs are
// whole miles/USD (seam contract) and the multiplier is an integer.
export function computeAwardPrice(
  pricing: AwardPricingInputs,
  travelers: number,
): AwardPriceDisplay
```

Tests (`pricing.test.ts`): travelers multiplication (1 and 4), program passed
through, `milesEquivalent` arithmetic (60000 + 40×80 = 63200).

## Work item 6 — `src/lib/engine/filter.ts`

Apply every TripIntent constraint to a set of options. Exact exports:

```ts
// Thrown when an option violates the generator contract (wrong route or outside the
// searched date window) — a wiring bug, not a filterable condition. Same loud-failure
// style as UnknownPlaceError in normalize.ts.
export class GeneratorContractError extends Error

export function filterOptions(
  intent: TripIntent,
  options: readonly FlightOption[],
): FlightOption[]
```

Per option, in this order:

1. **Contract assert** (decision 7), each check only when the intent field is
   non-null: `segments[0].from === intent.origin.iata`,
   `segments[at(-1)].to === intent.destination.iata`, and
   `intent.dates.earliest <= datePart(segments[0].departLocal) <= intent.dates.latest`
   (string comparison on ISO dates is correct). Violation → throw
   `GeneratorContractError` naming the option id and the failed check.
2. **Cabin**: `intent.cabin` non-null → keep iff `option.cabin === intent.cabin`
   (decision 5).
3. **nonstop `'required'`** → keep iff `segments.length === 1`. `'preferred'` never
   filters (rank boosts it).
4. **arriveBy** → keep iff `timeOfDayMinutes(final arriveLocal) <=` deadline minutes.
5. **departAfter** → keep iff `timeOfDayMinutes(first departLocal) >=` threshold.
6. **avoidRedeye `true`** → drop iff first departure time-of-day is in [22:00, 05:00)
   (wraps midnight; decision 3). `false`/`null` → no gate.
7. **avoidLateArrival `true`** → drop iff final arrival time-of-day is in
   [00:00, 05:00). `false`/`null` → no gate.

`travelers` is never consulted (decision 6). Pure and order-preserving — the input
array is not mutated and survivors keep their relative order.

Tests (`filter.test.ts`), using `makeOption`/`makeIntent`:

- each gate keeps/drops correctly; `null` and explicit `false` never gate
- boundaries: 22:00 departure IS a red-eye, 21:59 is not, 05:00 is not, 04:59 is;
  05:00 arrival survives `avoidLateArrival`, 04:59 does not; arrival exactly at the
  `arriveBy` deadline survives; departure exactly at `departAfter` survives
- the midnight edge is pinned as designed: a 00:30 arrival passes `arriveBy: '17:00'`
  (decision 4 — do not "fix")
- `nonstop: 'preferred'` filters nothing; `'required'` drops multi-segment options
- `GeneratorContractError` on wrong route and on out-of-window departure; no assert
  when the intent field is null
- multiple constraints compose (an option must survive all)

## Work item 7 — `src/lib/engine/rank.ts`

Scoring + best-match selection, stable under incremental batch arrival. Exact
exports:

```ts
// score is engine-internal: it drives ordering and must NEVER render to a user.
export interface RankedOption {
  readonly option: FlightOption
  readonly score: number
}

export function scoreOption(intent: TripIntent, option: FlightOption): number

// A pure function of the option SET: scores are per-option and set-independent, so
// batches merge without reshuffling what's already ranked (decision 10). Sorted
// ascending by (score, id) — id compared code-unit-wise.
export function rankOptions(
  intent: TripIntent,
  options: readonly FlightOption[],
): readonly RankedOption[]

export function bestMatch(
  ranked: readonly RankedOption[],
): FlightOption | null
```

Score (decision 9), lower = better, with named constants:

```
priceW = 1.0 × (intent.priority === 'cheapest' ? 3 : 1)
durW   = 0.5 × (intent.priority === 'fastest'  ? 3 : 1)

score = priceW × milesEquivalent(option.pricing) / 10000
      + durW × option.totalDurationMinutes / 60
      + 1.0 × stops
      + (intent.constraints.nonstop === 'preferred' && stops > 0 ? 2.0 : 0)
```

`priority` reweights, NEVER filters (ADR 0001): `rankOptions` returns every input
option, always.

Tests (`rank.test.ts`):

- pin the reweighting with this pair — A `{ baseMiles: 80000, feesUsd: 50 }`
  (milesEq 84000), 660 min, nonstop; B `{ baseMiles: 55000, feesUsd: 25 }`
  (milesEq 57000), 960 min, 1 stop. Base blend: A 13.9 < B 14.7 → A first.
  `priority: 'cheapest'`: A 30.7 > B 26.1 → B first. `priority: 'fastest'`:
  A 24.9 < B 30.7 → A first, margin widened
- `nonstop: 'preferred'` demotes a connecting option (+2.0) but drops nothing;
  output length always equals input length, priority set or not
- **batch stability**: `rankOptions(intent, shuffle(A ∪ B))` deep-equals
  `rankOptions(intent, A ∪ B)`; ranking A then merging batch B yields the same order
  as ranking the union directly; options present before the merge keep their relative
  order after it
- equal scores order by `id` ascending; `bestMatch` returns the first option and
  `null` on empty input

## Work item 8 — `src/lib/engine/explain.ts`

ExplanationFacts: computed comparisons WITHIN the current result set — the only raw
material the prose boundary may phrase. Exact export:

```ts
// `options` is the current FILTERED set (post-filterOptions), so superlatives
// already mean "under the active constraints". Throws if optionId is absent —
// explaining an option that isn't in the set is a wiring bug.
export function explainOption(
  intent: TripIntent,
  options: readonly FlightOption[],
  optionId: string,
): ExplanationFacts
```

Semantics:

- **cheapest** = min `milesEquivalent`, tie-break ascending id. **fastest** = min
  `totalDurationMinutes`, tie-break ascending id. **isBestMatch** = the option is
  `rankOptions(intent, options)[0]`.
- `price` = `computeAwardPrice(option.pricing, intent.travelers ?? 1)` (post-defaults
  travelers is never null; the fallback is belt-and-braces, not policy).
- `vsCheapest` / `vsFastest`: `null` when this option IS that reference; otherwise an
  `OptionComparison` with all four deltas as `this minus reference`.
  `arrivalDeltaMinutes` = `wallClockMinutes(final arrival)` difference — legal because
  every option in one set shares the destination airport (generator contract).
  `totalMilesDelta` uses party totals (same travelers on both sides).
- `arriveBy` = `intent.constraints.arriveBy`;
  `nonstopRequired` = `intent.constraints.nonstop === 'required'`.

All numbers in the facts are engine-computed; unit conversion for copy (360 minutes →
"6 hours") is the prose boundary's deterministic problem in M4, not yours — emit
minutes.

Tests (`explain.test.ts`):

- the PRD's marquee scenario: a fastest-but-not-cheapest option with one more stop
  than the cheapest, landing 360 minutes earlier, under an active `arriveBy` →
  `isFastest: true`, `vsCheapest: { stopsDelta: 1, arrivalDeltaMinutes: -360, ... }`,
  `arriveBy` carried through
- the cheapest option gets `vsCheapest: null` (and the fastest `vsFastest: null`)
- singleton set: all three superlative flags true, both comparisons null
- delta signs match the `this minus reference` convention in both directions
- `price` multiplies by `intent.travelers`; unknown `optionId` throws
- tie on `milesEquivalent` resolves cheapest by ascending id

## Verification (must all pass before you finish)

```
pnpm typecheck
pnpm test        # every new suite + existing suites + the untouched import guard
```

Do not commit. Leave the working tree for review. Report: files created/changed,
test counts, and anything you deviated on (deviations require a stated reason).
Then confirm your diff touches ONLY `src/lib/engine/` — anything else fails review.

## Explicitly out of scope

- The availability simulation: `AvailabilityProvider`, sources, the seeded generator,
  latency profiles (M3 — being built concurrently; stay out of its files).
- The prose module, number-provenance guard, `/api/*` routes, UI (M4/M5).
- Streaming plumbing — batches reach the engine as plain arrays; the transport is
  M4's problem.
- Doc updates (ROADMAP.md checkboxes, ARCHITECTURE.md, CONTEXT.md) — reconciled at
  review by the operator.
- Any schema change, any edit to `import-boundaries.test.ts`, any new dependency.
- Contradiction detection in `gaps.ts` (still no representable contradiction in the
  constraint vocabulary).
- Score calibration beyond the locked weights — the first end-to-end demo pass
  informs tuning, not this task.
