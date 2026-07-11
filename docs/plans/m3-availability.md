# M3 — Availability simulation: implementation plan

Self-contained plan for the M3 milestone (ROADMAP.md §M3). All design decisions below
are FINAL — they were resolved in a design session on 2026-07-10. Do not reopen them;
implement exactly as specified. Read PRD.md, ARCHITECTURE.md, CONTEXT.md, and
CLAUDE.md before starting; their invariants bind everything here.

M3 runs CONCURRENTLY with M2 (engine completion), which a different agent implements
in `src/lib/engine/`. The file-footprint rule below exists so the two never collide.

## Hard constraints (from CLAUDE.md / ARCHITECTURE.md — violations fail review)

- Dependency direction: `src/lib/availability` imports ONLY `zod`, `src/lib/schema`,
  `src/lib/engine`, and other availability files. Never `ai`/`@ai-sdk/*`, never
  parser/prose, never Next.js/React. Enforced by a new allowlist test you add to
  `src/lib/import-boundaries.test.ts` (work item 2).
- `src/lib/engine/types.ts` is the CONTRACT you generate against. It will exist
  before you start (the M2 agent creates it). Import from it; NEVER redefine
  `FlightOption`/`FlightSegment`/`AwardPricingInputs`, never edit any file under
  `src/lib/engine`. If the file is missing or its shape materially differs from the
  baseline in work item 1, STOP and report the discrepancy instead of adapting or
  redefining.
- Determinism: no `Math.random`, no `Date.now()`, no zero-argument `new Date()`, no
  wall-clock reads anywhere. Every random draw comes from the seeded PRNG; every
  delay goes through the injected `DelayFn`. Pure calendar arithmetic via
  `Date.UTC(...)` with explicit parts is allowed (it reads no clock).
- FILE FOOTPRINT (parallel-safety): create/edit ONLY files under
  `src/lib/availability/` PLUS the one additive test in
  `src/lib/import-boundaries.test.ts`. Do NOT touch ROADMAP.md, CONTEXT.md,
  ARCHITECTURE.md, CLAUDE.md, package.json, anything under `src/lib/engine` or
  `src/lib/schema`, or any other existing file. Doc updates happen at review.
- Latency budget: the FIRST batch of any search must be scheduled ≤ 600ms
  (ARCHITECTURE.md's <3s end-to-end criterion depends on it). Asserted by test.
- Package manager: pnpm. Never npm/yarn. Do not run `pnpm dev` or `pnpm build`.
  Verify with `pnpm typecheck` and `pnpm test`. Do not commit.
- TypeScript 5 strict, never `any`. Comments sparse; only genuinely non-obvious
  decisions.

## Locked decisions (context for why the specs look the way they do)

| # | Decision |
|---|---|
| 1 | Streaming shape: `AvailabilityProvider.search(query)` returns `AsyncIterable<SourceBatch>` (async generator). Framework-free, so the M4 route maps it 1:1 onto SSE with a `for await` loop; one merged provider (not one stream per source) keeps merge complexity out of the app layer. |
| 2 | Two-phase design: `planAvailability(query, config)` computes a fully deterministic schedule (every batch with its cumulative `atMs`), then `search()` merely walks the plan awaiting the injected delay between emissions. Batch ORDER is decided by the deterministic schedule, never by timer races — tests assert order and latency shape exactly, with zero wall-clock sleeps and no fake timers. |
| 3 | A batch carries `source` (id), `batchIndex` (0-based per source), `isFinal` (last batch from that source — lets the UI retire the per-source skeleton), and `options`. No counts or totals: the engine computes every number a user sees. Empty `options` on a final batch is legitimate (source found nothing). |
| 4 | Four fictional sources (personalities in work item 5): `meridian` (fast broad aggregator, the ≤600ms source), `aurora` (slow boutique, premium-leaning mix), `zephyr` (cheap miles, punishing surcharges), `vantage` (slowest, connection-heavy budget inventory, volatile pricing). Final batch of the slowest source lands ≤ ~2.8s so the stream feels alive inside the budget. All names fictional; no real airline/program names. |
| 5 | PRNG: mulberry32, implemented locally in `prng.ts` (~10 lines). Per-source seed = FNV-1a 32-bit hash of `` `${baseSeed}|${sourceId}|${origin}|${destination}|${dates.earliest}|${dates.latest}` ``. Identical searches are identical; different route/dates/source differ. `baseSeed` defaults to a fixed constant so demo runs are reproducible; callers may override. |
| 6 | `travelers` is deliberately EXCLUDED from the seed: inventory must not reshuffle when the party size changes. Each candidate option gets a deterministic internal seats-available draw per cabin; options that cannot seat the party are dropped BEFORE emission (per the seam: no seats field on `FlightOption`). Option ids are assigned before the seat filter, so an option keeps its id across party-size refinements. |
| 7 | `AvailabilityQuery` = `{ origin, destination, dates, travelers }`. Cabin is deliberately NOT an input: the generator over-produces its source's full cabin mix and `engine/filter` owns cabin selection — filtering lives in exactly one place. Travelers IS an input because seat feasibility is inventory, not preference. |
| 8 | Times: all `departLocal`/`arriveLocal` are local wall-clock `YYYY-MM-DDTHH:MM` fabricated internally consistently — a fixed per-airport UTC-offset table (no DST, fiction) lives inside availability, and `arriveLocal = departLocal + duration + (offset[to] − offset[from])`. Duration is carried explicitly on the option; NO consumer ever reverses times into durations. |
| 9 | Route shapes: a static per-pair nonstop block-time table over the 7 registry places (direction-agnostic — fiction tuned for plausibility, not accuracy). Pairs absent from the table (ORD/SFO/NRT ↔ LIS) are connection-only. Connections are `A→H→B` via hub `H ∈ {ORD, JFK, LHR, CDG}`, `H ∉ {A, B}`, both legs in the table; layover 60–180 min. |
| 10 | Premium scarcity: per-source cabin weights make business/first a small fraction of emitted options, AND premium seats-available bands are tight (business 1–4, first 1–2), so large parties lose premium naturally — a party of 9 can only ever seat in economy (all other bands max < 9). |
| 11 | Pricing inputs only (engine `pricing.ts` computes display totals): `baseMiles` = `(4000 + totalDurationMinutes × 55) × cabinMultiplier × sourceMultiplier × jitter`, rounded to the nearest 500, floor 7500 — one-traveler miles, cabin already reflected. `feesUsd` = integer USD drawn from the source's band. `program` = the source's display name. |
| 12 | Latency testability: `DelayFn = (ms: number) => Promise<void>`, injected via config, defaulting to real `setTimeout`. Tests inject an instantly-resolving recorder and assert the recorded gaps against the plan — no vitest fake timers needed (decision 2 makes order independent of timing). |
| 13 | Flexible date windows: sample up to 5 distinct departure days from the window via the PRNG (exact windows use the single day). The engine's filter keeps only in-window options anyway; sampling bounds generation cost for month-wide windows. |
| 14 | Exact PRNG draw order per option is the implementation's choice but MUST be fixed code — determinism is asserted by running the plan twice and requiring deep equality, plus a source-text scan banning `Math.random`/`Date.now`/zero-arg `new Date`. Tests pin invariants and shape, not golden values, so internals stay refactorable. |

---

## Work item 1 — contract intake

Read `src/lib/engine/types.ts` (created by the M2 agent) and import from it. The
baseline shape this plan was written against:

```ts
import type { Cabin } from '../schema/trip-intent'

export interface FlightSegment {
  from: string // IATA, registry member
  to: string
  departLocal: string // 'YYYY-MM-DDTHH:MM' local at `from`
  arriveLocal: string // 'YYYY-MM-DDTHH:MM' local at `to`
}

export interface AwardPricingInputs {
  baseMiles: number // one-traveler miles, cabin already reflected
  feesUsd: number   // one-traveler taxes/fees
  program: string   // fictional program name
}

export interface FlightOption {
  id: string // stable within a seeded run
  source: string // availability source id
  cabin: Cabin
  segments: readonly FlightSegment[] // >= 1; stops = segments.length - 1
  totalDurationMinutes: number
  pricing: AwardPricingInputs
}
```

Cosmetic drift (doc comments, member order) is fine. Renamed/added/removed fields or
changed types are NOT — stop and report rather than adapting. Use `import type` only.

## Work item 2 — extend the import guard

In `src/lib/import-boundaries.test.ts`, add ONE test in the style of the existing
engine test (this is your only edit outside `src/lib/availability/`):

```ts
it('availability imports only zod, schema, engine, and availability (allowlist)', () => {
  const availabilityDir = join(SRC, 'lib', 'availability')
  for (const file of sourceFiles(availabilityDir)) {
    const isTest = file.endsWith('.test.ts')
    for (const spec of importSpecifiers(file)) {
      if (spec === 'zod') continue
      if (isTest && spec === 'vitest') continue
      expect(spec.startsWith('.'), `${file} imports '${spec}'`).toBe(true)
      const target = resolve(join(file, '..'), spec)
      const allowed =
        target.startsWith(join(SRC, 'lib', 'availability')) ||
        target.startsWith(join(SRC, 'lib', 'engine')) ||
        target.startsWith(join(SRC, 'lib', 'schema'))
      expect(allowed, `${file} imports outside availability/engine/schema: '${spec}'`).toBe(true)
    }
  }
})
```

## Work item 3 — module skeleton and public types

All new files live under `src/lib/availability/`:

```
types.ts       AvailabilityQuery, SourceBatch, AvailabilityProvider, DelayFn,
               SourcePersonality, toAvailabilityQuery
prng.ts        mulberry32 + fnv1a seed hashing
time.ts        local-datetime arithmetic + fixed UTC offsets
routes.ts      nonstop block-time table + hub connection candidates
sources.ts     the four personalities
generate.ts    per-source seeded option generation
provider.ts    planAvailability + createSimulatedAvailability
```

### `types.ts`

```ts
import type { DateWindow, TripIntent } from '../schema/trip-intent'
import type { Cabin } from '../schema/trip-intent'
import type { FlightOption } from '../engine/types'

export interface AvailabilityQuery {
  origin: string // IATA, registry member
  destination: string
  dates: DateWindow
  travelers: number // seats every emitted option must be able to fill
}

export interface SourceBatch {
  source: string
  batchIndex: number
  isFinal: boolean
  options: readonly FlightOption[]
}

export interface AvailabilityProvider {
  search(query: AvailabilityQuery): AsyncIterable<SourceBatch>
}

export type DelayFn = (ms: number) => Promise<void>

export interface SourcePersonality {
  id: string
  program: string // display name; becomes AwardPricingInputs.program
  inventory: readonly [number, number] // target option count range (pre seat filter)
  connectionBias: number // probability an option is a one-stop itinerary
  cabinWeights: Readonly<Record<Cabin, number>>
  milesMultiplier: number
  milesJitter: number // ± fraction on baseMiles
  feesUsd: readonly [number, number]
  batches: 1 | 2
  firstBatchMs: readonly [number, number]
  interBatchMs: readonly [number, number] // ignored when batches === 1
}
```

`toAvailabilityQuery(intent: TripIntent): AvailabilityQuery` also lives here: throws
a plain `Error` naming the missing field when `origin`, `destination`, or `dates` is
null (search only ever opens on gap-free normalized intents; the throw is a defensive
invariant, mirroring `canonicalizePlaces`' posture). `travelers` falls back to
`intent.travelers ?? 1` — the engine's normalization owns the real default (D4); the
fallback only keeps this seam total.

## Work item 4 — deterministic primitives

### `prng.ts`

- `hashSeed(input: string): number` — FNV-1a 32-bit over the string's char codes,
  returned as an unsigned 32-bit int.
- `mulberry32(seed: number): () => number` — the standard ~10-line implementation;
  returns floats in [0, 1).
- Convenience draws built on it (exact set is your choice): int-in-range,
  pick-weighted, pick-from-array. All consume the generator in call order.

### `time.ts`

- `const UTC_OFFSET_MINUTES: Readonly<Record<string, number>>` — fixed, no DST:
  `ORD −360, SFO −480, JFK −300, NRT +540, LIS 0, LHR 0, CDG +60`.
- `addMinutes(local: string, minutes: number): string` — pure arithmetic on
  `YYYY-MM-DDTHH:MM`, rolling days/months/years correctly. Implement via
  `Date.UTC(parts)` + `getUTC*` reads (deterministic; reads no clock).
- Arrival construction (used by the generator):
  `arriveLocal = addMinutes(departLocal, durationMinutes + UTC_OFFSET_MINUTES[to] − UTC_OFFSET_MINUTES[from])`.
  Worked example to sanity-check against: depart ORD `2027-02-10T18:00`, duration
  780, to NRT → offset delta +900 → arrive `2027-02-11T22:00`.

## Work item 5 — route shapes and source personalities

### `routes.ts`

Nonstop block times in minutes, one value per unordered pair (fiction tuned for
plausibility; direction-agnostic by design):

```
ORD-SFO 270   ORD-JFK 135   ORD-NRT 780   ORD-LHR 470   ORD-CDG 495
SFO-JFK 330   SFO-NRT 660   SFO-LHR 620   SFO-CDG 640
JFK-NRT 840   JFK-LHR 415   JFK-CDG 440   JFK-LIS 400
NRT-LHR 780   NRT-CDG 760
LIS-LHR 155   LIS-CDG 150   LHR-CDG 80
```

Pairs not listed (LIS ↔ ORD/SFO/NRT) have no nonstop — connection-only routes.
Export: the table (lookup helper accepting either direction), `HUBS = ['ORD', 'JFK',
'LHR', 'CDG']`, and `connectionCandidates(from, to)` returning every valid
`A→H→B` (`H ∉ {A, B}`, both legs in the table). Every registry pair is reachable —
if a query somehow has no nonstop and no candidates (only `origin === destination`),
the source emits one final empty batch rather than throwing.

### `sources.ts`

Exports `SIMULATED_SOURCES: readonly SourcePersonality[]` — exactly these four
(cabin weights ordered economy / premium_economy / business / first; batch delays
are cumulative ms from search start, `r` = a PRNG float):

| id | program | inventory | conn. bias | cabin weights | miles ×, jitter | fees USD | batches (cumulative ms) |
|---|---|---|---|---|---|---|---|
| `meridian` | Meridian Rewards | 12–16 | 0.45 | .70/.12/.14/.04 | 1.00, ±15% | 15–60 | 2: `300 + r·150`, then `+200 + r·100` |
| `aurora` | Aurora Premier | 4–7 | 0.25 | .25/.15/.45/.15 | 1.35, ±10% | 20–80 | 1: `850 + r·150` |
| `zephyr` | Zephyr Flying Club | 8–12 | 0.50 | .55/.15/.25/.05 | 0.90, ±10% | 180–420 | 2: `1300 + r·200`, then `+450 + r·150` |
| `vantage` | Vantage Awards | 10–14 | 0.75 | .80/.10/.09/.01 | 0.75, ±25% | 10–45 | 2: `1750 + r·200`, then `+450 + r·200` |

Personalities in one line each (capture as short doc comments): meridian is the
broad, fast aggregator — big economy-heavy inventory, mild pricing, and the source
that makes the ≤600ms budget (worst case 450ms). aurora is a slow boutique with tiny
inventory that leans premium in MIX (premium stays absolutely scarce via tiny
inventory × tight seat bands) at expensive miles. zephyr sells cheap miles and claws
it back in surcharges. vantage is the slow completionist: mostly one-stops, cheapest
and most volatile miles, closing the stream ≤ ~2.8s.

## Work item 6 — the generator (`generate.ts`)

`generateSourceOptions(personality, query, baseSeed): readonly FlightOption[]` —
fully deterministic given its arguments:

1. `rng = mulberry32(hashSeed(`${baseSeed}|${id}|${origin}|${destination}|${earliest}|${latest}`))`.
   One generator per (source, query); latency draws (work item 7) share it.
2. Departure days: `exact` → the single day; `flexible` → up to 5 distinct days
   drawn from the window (decision 13).
3. Target count from `inventory` via rng. Per option: itinerary kind (one-stop with
   probability `connectionBias` when candidates exist, else nonstop when the table
   has the pair; a connection-only route is always one-stop), a departure day, a
   depart time, a cabin from `cabinWeights`, seats, pricing.
4. Depart times: global band weights morning `[06:00,10:00)` 0.30, midday
   `[10:00,16:00)` 0.30, evening `[16:00,21:00)` 0.25, red-eye `[21:00,23:55]` 0.15;
   5-minute granularity. (The red-eye band plus long-haul offset math is what gives
   `engine/filter`'s avoidRedeye/avoidLateArrival constraints real material.)
5. Segments: nonstop leg duration = table base × `(0.95 + r·0.15)` rounded to 5 min.
   One-stop = two table legs jittered the same way, layover `60 + r·120` rounded to
   5 min; leg 2 departs at leg 1's `arriveLocal + layover`. `totalDurationMinutes` =
   legs + layover. All arrivals via the work-item-4 offset formula.
6. Seats (internal, never emitted): per-cabin bands economy 4–9,
   premium_economy 2–5, business 1–4, first 1–2. Assign
   `id = `${id}-${String(seq).padStart(3, '0')}`` in generation order FIRST, then
   drop options with seats < `query.travelers` (decision 6).
7. Pricing per decision 11.

## Work item 7 — the provider (`provider.ts`)

```ts
export interface PlannedBatch extends SourceBatch {
  atMs: number // cumulative delay from search start
}

export interface SimulationConfig {
  baseSeed?: number   // default: a fixed exported constant
  delay?: DelayFn     // default: real setTimeout
  sources?: readonly SourcePersonality[] // default: SIMULATED_SOURCES
}

export function planAvailability(
  query: AvailabilityQuery,
  config?: SimulationConfig,
): readonly PlannedBatch[]

export function createSimulatedAvailability(config?: SimulationConfig): AvailabilityProvider
```

`planAvailability`: per source, generate options, draw batch times from the same rng
per the personality's formulas, split options across batches (2-batch sources put
~60% in the first, remainder in the second; contiguous slices). Every source emits
at least one batch and exactly one `isFinal`, even with zero options. Merge all
sources' batches sorted by `(atMs, source)` — deterministic order by construction.

`search()`: an async generator over the plan — `await delay(batch.atMs - elapsed)`,
yield the `SourceBatch` (strip `atMs`), advance `elapsed`. No timers race; the
injected delay only paces emission.

## Work item 8 — tests

All offline, all deterministic, all in `pnpm test`. Suggested files: `prng.test.ts`,
`time.test.ts`, `generate.test.ts`, `provider.test.ts`. Must cover:

- **prng**: same seed → identical sequence; different seeds differ;
  `hashSeed` stable and collision-distinct on the seed-string components (route
  swap, date change, source change each produce a different seed).
- **time**: `addMinutes` day/month rollovers; the ORD→NRT worked example from work
  item 4.
- **Generator invariants** (pinned query: ORD→NRT, `2027-02-01..2027-02-28`
  flexible, travelers 2, default seed; assert across all four sources): segments
  chain (`segments[i].to === segments[i+1].from`), first `from` = origin, last `to`
  = destination; every `arriveLocal` recomputes exactly from `departLocal` +
  duration + offset delta; departure dates inside the window; ids unique and
  prefixed with the source id; `baseMiles` a multiple of 500 and ≥ 7500; `feesUsd`
  an integer inside the source's band; aggregated across sources, business + first
  option count < economy count (scarcity).
- **Determinism**: `planAvailability` twice with identical inputs → deep-equal;
  changing the date window or the route → NOT deep-equal.
- **Seat feasibility**: travelers 9 (vs. travelers 1, same seed) yields a subset of
  option ids, and every surviving option is economy (premium bands max out below 9).
- **Batch ordering and latency shape** (across at least 3 distinct queries): plan
  `atMs` non-decreasing; the overall first batch is `meridian` at ≤ 600ms; each
  source emits `batchIndex` 0..n−1 with exactly one `isFinal`; all four sources
  present; last batch ≤ 2800ms.
- **Stream behavior**: `search()` with a recording instant delay
  (`(ms) => { recorded.push(ms); return Promise.resolve() }`) yields batches in
  exactly the plan's order, and `recorded` equals the successive `atMs` gaps.
- **No wall-clock/ambient randomness**: a source-text scan over
  `src/lib/availability/*.ts` (non-test) asserting no match for
  `/Math\.random|Date\.now|new Date\(\)/`.

## Verification (must all pass before you finish)

```
pnpm typecheck
pnpm test        # all suites incl. the new guard test, no network, no real sleeps
```

Do not commit. Leave the working tree for review. Report: files changed, test
counts, and anything you deviated on (deviations require a stated reason).

## Explicitly out of scope

- The `/api/search` SSE route and any Next.js wiring (M4 adapts the AsyncIterable).
- Everything in `src/lib/engine` — filter, rank, pricing math, explain (M2, running
  concurrently). You emit raw `AwardPricingInputs`; you never compute display totals
  or multiply by travelers.
- Doc updates (ROADMAP.md, ARCHITECTURE.md, CONTEXT.md) — reconciled at review.
- Any schema or engine type change, including "improvements" to `engine/types.ts`.
- UI, prose, parser — untouched.
