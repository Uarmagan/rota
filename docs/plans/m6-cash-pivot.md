# M6 — Realistic inventory + cash pricing: implementation plan

Self-contained plan for the M6 pivot (decided 2026-07-14). Rota keeps its simulated
availability but the inventory must *read* like Google Flights: a much larger airport
registry, real airline identities on fake flights, and cash prices instead of award
miles. All design decisions below are FINAL. Read PRD.md, ARCHITECTURE.md, CONTEXT.md,
and CLAUDE.md first; their invariants bind everything here except where this plan
explicitly amends them.

## Scope split

This plan covers everything EXCEPT the UI: registry, availability generator, engine,
prose, API-layer fallout, tests, docs. The UI relayout (merged ranked list, airline
rows, simulated badge) is done separately by the operator's agent after this lands.
Do not modify files under `src/app/ui/` except where a type rename forces a
mechanical fix (keep those fixes minimal — the UI is about to be reworked anyway).

## Hard constraints (violations fail review)

- `src/lib/engine` stays pure TS (zod/schema/engine imports only); availability stays
  clock-free and `Math.random`-free; LLM packages only under parser/ and prose/.
  `src/lib/import-boundaries.test.ts` is extended if needed, never weakened.
- No number shown to a user may originate from an LLM. The number-provenance guard
  survives this pivot with cash semantics.
- `src/lib/schema/trip-intent.ts` stays FROZEN — `Place` remains `{ iata, city }`,
  TripIntent/ParseResult shapes untouched. The M2/M3 seam (`engine/types.ts`) is
  AMENDED exactly as specified in work item 3 and no further.
- Determinism: same seed + query → identical inventory. All existing test suites must
  pass after mechanical updates; never delete an assertion to make a test pass.
- pnpm only. Do not run `pnpm dev`/`pnpm build`/`pnpm eval` or any live LLM call.
  Verify with `pnpm typecheck` and `pnpm test`.
- Never `any`. Comments sparse.

## Locked decisions

| # | Decision |
|---|---|
| 1 | Pricing is CASH ONLY: `pricing: { priceUsd: number }` per traveler, engine multiplies to a party total. Award miles, fees-as-miles conversion (`FEES_MILES_PER_USD`), and program names are DELETED, not kept alongside. `priority: 'cheapest'` semantics unchanged (reweights the price axis). |
| 2 | Registry grows to ~55 airports worldwide (work item 1). Multi-airport metros use the EXISTING registry-order rule (docs/adr/0003 stays; this exercises its escape hatch): a bare city name resolves to the first entry for that city; a named airport ("newark", "EWR", "haneda") resolves to its own entry. No metro-code abstraction. |
| 3 | `Place` stays `{ iata, city }` (schema frozen). All new per-airport data (airport display name, lat/lon, UTC offset, hub flag) lives in a NEW availability-layer table keyed by IATA, with a sync test asserting exact 1:1 coverage with `SUPPORTED_PLACES`. |
| 4 | Flights carry REAL airline identities (United, ANA, Delta, BA, …) with plausible flight numbers, assigned deterministically and route-appropriately (work item 2). Honesty is preserved at the UI layer with a persistent "simulated data" label (UI's job, not this plan's). The four fictional sources remain as transport personalities (latency, inventory shape) — they stop being a display concept but stay on `FlightOption.source` and in `SourceBatch`. |
| 5 | Durations come from geometry, not a hand table: haversine distance between airport coordinates → block minutes (`round((distanceKm / 830h speed) * 60 + 45min overhead, to 5min)`). The 18-pair `NONSTOP_BLOCK_MINUTES` table is deleted. Approximate real-world coordinates are fine (±0.5°); a test pins 3–4 known pairs to sanity bands (ORD→NRT nonstop 720–840min), not exact values. |
| 6 | UTC offsets are a static per-airport minutes column (no DST — an accepted fiction, same as today). Segment times remain LOCAL wall-clock strings; duration stays explicit; no timezone math anywhere downstream (seam rule survives). |
| 7 | Cash price formula (per traveler, whole USD): `round((80 + distanceKm * 0.085) * cabinMult * sourceMult * jitter)` with `cabinMult` economy 1 / premium_economy 1.6 / business 3.2 / first 5.0, source `milesMultiplier` renamed `priceMultiplier` (same values), jitter drawn per option from the existing seeded rng within each source's existing jitter band. Connections price 0.75–0.9× the nonstop-equivalent (drawn per option) — connections must usually be cheaper or ranking stories die. |
| 8 | Ranking: `milesEquivalent` is replaced by the option's per-traveler `priceUsd`. Score = `priceW * (priceUsd / 100) + durW * hours + stops + preferredPenalty` — same weights, constants, multipliers, tie-break, and set-independence as today (the /100 keeps the price term in the same numeric band the old /10000 did). |
| 9 | `ExplanationFacts.price` becomes `{ totalUsd: number }` (party total). `OptionComparison.totalMilesDelta` → `totalUsdDelta` (party, this-minus-reference). Prose renders `$1,240`-style figures; the guard's allowed set gets the USD values (party totals and absolute deltas) instead of miles/fees. |
| 10 | Parser prompt: the places list is regenerated from the registry (still IATA + city label pairs) plus ONE new policy line: "a bare city name means the first listed airport for that city; a specific airport name or code means that airport." Everything else in the prompt is untouched. Existing fixtures stay valid because each pins its own `supportedPlaces` context snapshot — do not rewrite them. |

---

## Work item 1 — registry expansion (`src/lib/schema/places.ts`)

Grow `SUPPORTED_PLACES` to ~55 entries. Composition (registry order within a metro is
the bare-name resolution policy — put the primary airport first):

- **US**: JFK, LGA, EWR (New York, New York, Newark), ORD, MDW (Chicago, Chicago),
  SFO, OAK (San Francisco, Oakland), LAX, SEA, BOS, MIA, ATL, DFW, DEN, IAD, PHX,
  LAS, SAN, AUS, HNL
- **Europe**: LHR, LGW, STN (London ×3), CDG, ORY (Paris ×2), AMS, FRA, MUC, ZRH,
  MAD, BCN, FCO, MXP, LIS, DUB, CPH, ARN, VIE, BER, ATH, IST
- **Asia-Pacific**: NRT, HND (Tokyo ×2), KIX, ICN, PEK, PVG, HKG, TPE, SIN, BKK,
  DEL, BOM, SYD, MEL, AKL
- **Middle East / other**: DXB, DOH, TLV, GRU, MEX, YYZ, YVR

City labels: the city proper ("New York" for JFK and LGA, "Newark" for EWR, "Tokyo"
for NRT and HND). Bump `PLACES_VERSION` to `2026-07-14.1`. Update the file's header
comment: one-airport-per-city is no longer true; registry order resolves bare city
names (the policy ADR 0003 reserved).

Note the old `unsupported-city` fixture uses "berlin": BER is now in the LIVE
registry, but the fixture pins its own 7-place context snapshot, so it still tests
the unsupported-place mechanism. Leave it alone; add one clarifying sentence to its
`description`.

**New parser fixtures** (same file conventions; pinned context uses the NEW registry):

- `specific-airport-over-metro` (initial, empty current): `from newark to london in
  march` → origin `{ EWR, Newark, assumed: false }`, destination LHR (bare "london" →
  first London entry), dates Mar 2027 flexible (context `today` stays `2026-07-09`;
  March 2027 is the next occurrence — wait, March 2026 is past, so 2027-03-01..31).
  Changed fields: origin, destination, dates.
- `metro-secondary-airport` (refinement): current = travelers 1, origin `{ JFK, New
  York, assumed: false }`, dest LHR, cabin economy, dates Mar 2027 flexible, priority
  null, no constraints; utterance `actually fly out of laguardia` → origin
  `{ LGA, New York, assumed: false }`, all else verbatim. Changed fields: origin.

Both must pass the self-consistency suite (`pnpm test`); if one fails, fix the
fixture literal, never the runner.

## Work item 2 — availability realism (`src/lib/availability/`)

### `airports.ts` (new)

```ts
export interface AirportInfo {
  iata: string
  name: string            // 'Newark Liberty International'
  lat: number
  lon: number
  utcOffsetMinutes: number // static, no DST
  hub: boolean             // connection candidate
}
export const AIRPORTS: Readonly<Record<string, AirportInfo>>
export function airportInfo(iata: string): AirportInfo // throws on unknown
```

Hubs (connection candidates): ORD, JFK, ATL, DFW, DEN, SFO, LAX, SEA, YYZ, LHR, CDG,
AMS, FRA, MUC, IST, DXB, DOH, SIN, HKG, ICN, NRT, PEK. Sync test: `AIRPORTS` keys ===
`SUPPORTED_PLACES` IATA set, exactly.

### `routes.ts` (rewrite)

Delete `NONSTOP_BLOCK_MINUTES` and `HUBS`. New exports:

- `distanceKm(a: string, b: string): number` — haversine over `AIRPORTS` coords.
- `blockMinutes(from: string, to: string): number` — decision 5 formula.
- `connectionCandidates(origin, destination): string[]` — hubs, excluding the
  endpoints, where `dist(o,h) + dist(h,d) <= 1.35 * dist(o,d)` (no absurd backtracks),
  sorted by total detour ascending, capped at 4.

Sanity tests: ORD→NRT block in [720, 840]; JFK→LHR in [360, 450]; symmetric;
connection candidates for LIS→ORD non-empty and detour-bounded.

### `airlines.ts` (new)

Real carriers with IATA prefixes and route affinity:

```ts
export interface Airline { code: string; name: string; region: 'na' | 'eu' | 'apac' | 'me' | 'global' }
export const AIRLINES: readonly Airline[]
export function airlinesForRoute(from: AirportInfo, to: AirportInfo): readonly Airline[]
```

~18 carriers (UA United, AA American, DL Delta, AC Air Canada, BA British Airways,
AF Air France, KL KLM, LH Lufthansa, LX SWISS, IB Iberia, TP TAP, TK Turkish,
EK Emirates, QR Qatar, NH ANA, JL JAL, SQ Singapore, CX Cathay). Region derived from
airport longitude/latitude bands (crude is fine, it's deterministic fiction): a route
is served by carriers matching either endpoint's region plus the 'global' set (EK/QR/
TK count as global). Flight numbers: `${code} ${drawInt(rng, 1, 1999)}`, zero-padded
to 1–4 digits as drawn (no padding needed) — assigned per segment from the seeded rng;
both segments of a connection may differ in carrier only if both carriers serve the
route (draw once per option whether it's single-carrier, 80% yes).

### `generate.ts` / `sources.ts` / `types.ts` adjustments

- `SourcePersonality`: `milesMultiplier` → `priceMultiplier` (same values),
  `milesJitter` → `priceJitter`, `feesUsd` band DELETED. Latency profiles, inventory
  bands, cabin weights, connection bias, batch counts all stay.
- Option generation: same seeded flow (ids assigned pre-seat-filter, seat scarcity
  bands unchanged, travelers excluded from the seed string), but durations from
  `blockMinutes`, connections via `connectionCandidates` with layovers 60–180min
  (seeded draw, rounded to 5), segment local times computed with the static UTC
  offsets, per-segment `flight` strings per airlines.ts, and pricing per decision 7.
- `generateSourceOptions` keeps its signature. Update focused tests mechanically
  (shape assertions swap miles fields for `priceUsd`/`flight`); keep the determinism,
  seat-scarcity, id-stability, and boundary tests intact.

## Work item 3 — engine seam amendment (`src/lib/engine/`)

`types.ts` — exact amendments, nothing else:

```ts
export interface FlightSegment {
  from: string
  to: string
  departLocal: string
  arriveLocal: string
  flight: string          // 'NH 011' — display identity, engine logic never reads it
}

export interface CashPricingInputs { priceUsd: number } // one traveler, whole USD

export interface FlightOption { /* unchanged except */ pricing: CashPricingInputs }

export interface PriceDisplay { totalUsd: number }       // replaces AwardPriceDisplay

export interface OptionComparison { /* stopsDelta, durationDeltaMinutes,
  arrivalDeltaMinutes unchanged */ totalUsdDelta: number }

export interface ExplanationFacts { /* unchanged except */ price: PriceDisplay }
```

Update the header comment (raw pricing inputs → engine computes display totals rule
survives verbatim with cash words).

- `pricing.ts`: delete `FEES_MILES_PER_USD` and `milesEquivalent`; `computeAwardPrice`
  → `computePartyPrice(pricing, travelers): PriceDisplay` (`priceUsd * travelers`,
  no rounding).
- `rank.ts`: price term `priceWeight * (option.pricing.priceUsd / 100)`; everything
  else byte-identical.
- `explain.ts`: cheapest by `priceUsd`; `totalUsdDelta` via party totals; rest
  unchanged.
- `facts-schema.ts`: mirror the new shapes (`.nullable()` discipline unchanged).
- All engine tests updated mechanically — same scenarios, cash numbers. Keep the
  batch-stability and tie-break tests meaningful (recompute expected values, don't
  loosen them).

## Work item 4 — prose (`src/lib/prose/`)

- `render.ts`: `formatUsd(n)` → `$1,240` (en-US grouping, no cents). Price line
  `price: $2,480 total` (party). Comparisons: `$210 cheaper` / `$210 more`. Delete
  miles renderers. `fallbackLine` becomes e.g. `Best match for your search. Nonstop,
  13h 35m, $2,480 total.`
- `number-guard.ts`: allowed set swaps miles/fees for `price.totalUsd` and
  `|totalUsdDelta|` (duration/clock/stops derivations unchanged). The fallback-is-
  guard-clean property test must still pass.
- `prompt.ts`: update the held-out example to cash figures; hard rules unchanged.
- Tests updated to cash equivalents; keep every rejection case (foreign number,
  rounded duration, spelled compounds, vague words).

## Work item 5 — fallout sweep

- `src/lib/integration.test.ts`: update price assertions (`totalUsd === 2 *
  priceUsd`, etc.); the seam/battery of six invariants stays.
- `src/lib/parser/prompt.ts`: regenerate places list from the registry + the one
  policy line (decision 10).
- `src/app/api/*`: should be shape-transparent; fix any type fallout only.
- `src/app/ui/*`: mechanical type fixes only (e.g. `computeAwardPrice` →
  `computePartyPrice`, miles → `$` in the row) so `pnpm typecheck`/`pnpm test` pass.
  No layout work — flag every UI file you had to touch in your report.
- Grep the repo for `miles`, `award`, `program`, `fees` and clean up stragglers in
  code and code-comments (docs handled below).

## Work item 6 — docs

- **ROADMAP.md**: insert `## M6 — Google-Flights pivot` (this plan: registry ~55,
  cash pricing, real airlines, geometry durations) with checkboxes, and renumber the
  old M6 demo-hardening section to M7. Status line: M6 in progress, UI relayout
  follows separately.
- **ARCHITECTURE.md**: pricing wording (award → cash), availability blurb (airports
  table, haversine durations, real airline identities as deterministic fiction).
- **CONTEXT.md**: "Award pricing" entry → **Cash pricing** (simulated cash fares,
  party totals engine-computed); add **Airline identity** (real carrier names on
  simulated flights — a labeled fiction, prices assert nothing about real carriers;
  the UI carries a persistent "simulated" label); update the number-provenance
  defense note's examples from miles to dollars. Update "Place registry" for
  registry-order metro resolution.
- **PRD.md**: §4 pricing sentence (award-style → cash, Google-Flights comparison) and
  the success-criteria line if it mentions miles.
- **New ADR** `docs/adr/0008-cash-pricing-and-realistic-inventory.md`: context (demo
  credibility beats award flavor; unknown airports made the registry feel broken),
  decisions (cash-only pricing; ~55-airport registry with registry-order metros; real
  airline names on simulated inventory with a UI-level "simulated" label; geometry-
  derived durations), why, and rejected (cash+miles dual display — two price scalars
  poison ranking legibility; metro codes — still disproportionate; fictional
  airlines — undercuts the realism goal the pivot exists for).

## Verification

```
pnpm typecheck
pnpm test        # full suite, no network — expect every suite green
```

Do not commit. Report: files changed, test count delta, every `src/app/ui/` file you
had to touch, and any deviation with its reason.

## Explicitly out of scope

- The UI relayout (merged ranked list, airline rows, simulated badge, source status
  line) — done separately after this lands.
- Real data, booking links, round-trip, cents, currencies other than USD, DST.
- Any TripIntent/ParseResult schema change; parser retry/eval logic; route contracts.
