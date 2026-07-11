# M4 — API routes + prose: implementation plan

Self-contained plan for the M4 milestone (ROADMAP.md §M4). All design decisions below
are FINAL — resolved in a design session on 2026-07-11. Do not reopen them; implement
exactly as specified. Read PRD.md, ARCHITECTURE.md, CONTEXT.md, and CLAUDE.md before
starting; their invariants bind everything here.

## Hard constraints (from CLAUDE.md / ARCHITECTURE.md — violations fail review)

- `src/lib/engine` stays pure TS (imports only zod/schema/engine). LLM packages only
  under `src/lib/parser` and `src/lib/prose`. Enforced by
  `src/lib/import-boundaries.test.ts` — which this plan extends (work item 3), never
  weakens.
- **No number shown to a user may originate from an LLM.** M4 builds the enforcement
  mechanism itself (the number-provenance guard); the guard rejects, it never
  "corrects". Sole carve-out: the `unhandled` echo (docs/adr/0002) — not touched here.
- AI SDK v6 line only. `generateObject`/`streamObject` are BANNED. The prose call is
  plain-text `generateText` (no `Output.object` needed — the output is copy, not
  structure). TypeScript stays 5.x. Never `any`.
- Schema absence is `.nullable()`, never `.optional()` — applies to the new
  `explanationFactsSchema` too.
- `src/lib/schema/trip-intent.ts` is FROZEN. `src/lib/engine/types.ts` is the M2/M3
  seam — its existing interfaces are FROZEN too (you add a new sibling file, item 1;
  you never edit the interfaces).
- Routes use web-standard `Request`/`Response` only — never `next/server` imports —
  so route handlers unit-test under plain Vitest with no Next runtime.
- Package manager: pnpm. Never npm/yarn. Do not run `pnpm dev` or `pnpm build`. Do
  not run `pnpm eval` or any curl smoke (the operator does that; the dev server is
  not yours to manage). Verify with `pnpm typecheck` and `pnpm test` only.
- Comments: sparse; only genuinely non-obvious decisions.

## Locked decisions (context for why the specs look the way they do)

| # | Decision |
|---|---|
| 1 | Three routes: `POST /api/parse`, `GET /api/search`, `POST /api/explain`. The search stream carries RAW `SourceBatch`es only — no server-side filter/rank/facts. The engine is isomorphic pure TS (ARCHITECTURE: "the client re-ranks streamed results locally with the same code the tests exercise"), so the client owns filter → rank → best-match → `ExplanationFacts` per batch. Prose is an LLM call and cannot run client-side, so the client POSTs the facts it computed to `/api/explain` and gets copy back. This keeps the stream cheap, keeps re-ranking instant on chip edits (no round trip), and gives prose exactly one input shape: `ExplanationFacts`. |
| 2 | `/api/parse` runs pipeline steps 1–3 server-side: `parser.parse` → `canonicalizePlaces` → `fillAssumptions` → `fillDefaults`, then adjudicates `checkGaps(intent, unhandled)`. Response: `{ intent, gap }` — `gap` is the engine's `GapOutcome` and already carries the follow-up question or the `unhandled` notice, so `unhandled` is not returned separately. The IntentDiff (step 4) is NOT computed here: it is presentation, the client holds the previous normalized intent, and chip taps skip this route entirely. |
| 3 | `/api/search` is **GET** with the full TripIntent as a URL-encoded JSON `intent` query param, streaming `text/event-stream` (SSE). GET+SSE is `EventSource`-compatible and curl-friendly; the intent is small enough for a query string. Events: one `batch` event per `SourceBatch`, then a terminal `done` event. Real latency: the route uses the default simulated provider (real `setTimeout` delays, `DEFAULT_BASE_SEED`) — fake data, honest transport. Client disconnect stops the iteration. |
| 4 | Route files are thin wrappers over exported handler functions that take injected dependencies (`IntentParser`, `AvailabilityProvider`, `ResultExplainer`). `src/app/api/deps.ts` wires the real ones. Unit tests inject stubs / an instant-delay provider, so `pnpm test` stays offline, fast, and deterministic; live timing is verified by the operator's curl smoke, not by tests. |
| 5 | `ResultExplainer.explain(facts)` returns `{ text: string; source: 'model' \| 'fallback' }` and **never throws**. Any failure — transport error, guard violation, empty output, output over 300 chars — falls straight back to the deterministic template. NO feedback retry (deliberately unlike the parser): a parse failure blocks the product, a prose failure only costs flourish, and the fallback is already correct copy. The `source` flag exists for observability and possible M5 styling; it carries no numbers. This widens ARCHITECTURE's `Promise<string>` signature — update the doc (item 6). |
| 6 | Number-provenance guard mechanics: build an allowlist of numeric VALUES derived deterministically from the facts (including hour/minute decompositions of every duration, 12h and 24h forms of clock times, and absolute values of deltas), extract every digit run and every cardinal number word from the candidate copy, and reject if any extracted value is not in the allowlist. Vague quantity words (`half`, `quarter`, `dozen`, `couple`, `few`, `several`) always reject. Ordinal words are deliberately NOT guarded ("first class" would collide). The derivation is deterministic TS — the model still never originates a number; the guard only recognizes engine numbers in the formats a copywriter would use. |
| 7 | The prose prompt hands the model PRE-RENDERED strings ("duration: 13h 35m", "price: 145,000 miles + $96"), produced by the same deterministic renderers the fallback template uses. The model quotes; it never computes, converts, or rounds. System message static (cache-friendly, goal-first per the GPT-5.6 guide); rendered facts go in the user message. Model from `ROTA_MODEL` (default `gpt-5.6-luna`), `reasoningEffort: 'none'`, `maxRetries: 1`, `maxOutputTokens: 300`, no temperature/top_p/stop. |
| 8 | `explanationFactsSchema` lives in a NEW engine file `src/lib/engine/facts-schema.ts`, annotated `z.ZodType<ExplanationFacts>` so any drift from the frozen interface fails `pnpm typecheck`. Engine may import zod (allowlist already permits it). It validates the `/api/explain` body. |
| 9 | `today` for `ParserContext` is `new Date().toISOString().slice(0, 10)` (UTC) — the app layer is the one sanctioned place wall-clock enters the system (engine and availability remain clock-free; their guards already ban `new Date()`). UTC-vs-local drift is an accepted demo simplification. The engine's `NormalizeConfig.defaultOrigin` is `{ iata: 'ORD', city: 'Chicago' }` (the PRD's demo assumption). |
| 10 | HTTP error contract: malformed body/query or schema-invalid input → 400 `{ error: 'invalid_request', detail }`; `ParserError('invalid_output')` → 422 `{ error: 'invalid_output' }` (the future UI's rephrase prompt); `ParserError('transport')` → 502 `{ error: 'transport' }`; intent not searchable (null destination/dates) on `/api/search` → 400 `{ error: 'not_searchable', detail }`. A `follow_up` gap outcome is a SUCCESS (200) — a targeted question is the product working, not an error. |

---

## Work item 1 — engine facts schema

New file `src/lib/engine/facts-schema.ts` (imports: zod + `./types` only — the engine
allowlist guard must stay green):

```ts
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
```

Test `src/lib/engine/facts-schema.test.ts`: a valid facts object parses; a missing
field rejects (absence must be explicit `null`, never omission); a bad `arriveBy`
format rejects; a float `totalMiles` rejects.

## Work item 2 — the prose module (`src/lib/prose/`)

New directory. Imports allowed (enforced by item 3): `ai`, `@ai-sdk/*`, `zod`,
`../schema/*`, `../engine/*`, `./*`.

### `src/lib/prose/result-explainer.ts`

```ts
import type { ExplanationFacts } from '../engine/types'

export interface Explanation {
  text: string
  source: 'model' | 'fallback'
}

export interface ResultExplainer {
  explain(facts: ExplanationFacts): Promise<Explanation>
}
```

### `src/lib/prose/render.ts` — deterministic renderers, shared by prompt AND fallback

Every number a user might read is formatted HERE, by code:

- `formatDuration(minutes)`: `13h 35m`; omit the minutes part when `m === 0`
  (`13h`); hours part omitted when `h === 0` (`45m`).
- `formatMiles(n)`: `n.toLocaleString('en-US')` → `145,000`.
- `renderStops(stops)`: `nonstop` | `1 stop` | `${n} stops`.
- `renderComparison(c: OptionComparison)`: parts joined with `; `, each rendered from
  the sign and absolute value (deltas are this-minus-reference):
  - stops: `same stops` | `1 more stop` / `1 fewer stop` | `${n} more/fewer stops`
  - duration: `same duration` | `${formatDuration(abs)} slower/faster`
  - arrival: `arrives at the same time` | `arrives ${formatDuration(abs)} earlier/later`
  - miles: `same miles` | `${formatMiles(abs)} more/fewer miles`
- `renderFacts(facts)`: the labeled block the model sees. One line per item; omit a
  line entirely when its value is null/false:

  ```
  stops: 1 stop
  duration: 16h 40m
  price: 98,000 miles + $112 (Meridian Elite)
  badges: cheapest            <- only the true ones of best match/cheapest/fastest; 'none' if none
  arrive-by deadline: 17:00   <- omit when null
  nonstop required: yes       <- omit when false
  vs cheapest: 1 more stop; 2h 10m slower; arrives 6h earlier; 8,000 more miles   <- omit when null
  vs fastest: ...             <- omit when null
  ```

- `fallbackLine(facts)`: lead sentence — `isBestMatch` → `Best match for your
  search.`, else `isCheapest` → `The cheapest option in this set.`, else `isFastest`
  → `The fastest option in this set.`, else `A solid option.` — followed by
  `${RenderedStops (capitalized)}, ${formatDuration(...)}, ${formatMiles(totalMiles)}
  miles + $${totalFeesUsd}.`
  Example: `Best match for your search. Nonstop, 13h 35m, 145,000 miles + $96.`

### `src/lib/prose/number-guard.ts`

```ts
export function allowedNumbers(facts: ExplanationFacts): ReadonlySet<number>
export function checkNumberProvenance(
  copy: string,
  facts: ExplanationFacts,
): { ok: true } | { ok: false; violations: string[] }
```

`allowedNumbers` collects, exactly:

- `stops`
- `addDuration(totalDurationMinutes)` where `addDuration(d)` adds `d`,
  `Math.floor(d / 60)`, and `d % 60`
- `price.totalMiles`, `price.totalFeesUsd`
- when `arriveBy` non-null, from its `HH:MM`: `h`, `h % 12 === 0 ? 12 : h % 12`, `m`
- for each non-null comparison (`vsCheapest`, `vsFastest`): `|stopsDelta|`,
  `addDuration(|durationDeltaMinutes|)`, `addDuration(|arrivalDeltaMinutes|)`,
  `|totalMilesDelta|`

`checkNumberProvenance` extracts from the copy:

- digit tokens via `/\d+(?:,\d{3})*(?:\.\d+)?/g`, value = `Number` after stripping
  commas (so `62,500` → 62500, `18:00` → tokens 18 and 0, `13h 35m` → 13 and 35);
- word tokens (lowercased, split on non-letters and on hyphens) looked up in
  `NUMBER_WORDS`: zero…twenty (0–20), thirty, forty, fifty, sixty, seventy, eighty,
  ninety (tens), hundred (100), thousand (1000), million (1000000). Cardinals only —
  no ordinals, by decision 6. A hyphenated compound like `sixty-two` yields two
  tokens, each independently checked (spelled-out big numbers therefore always fail —
  intended; the prompt mandates digit renderings);
- `VAGUE_WORDS` (`half`, `quarter`, `dozen`, `couple`, `few`, `several`) are
  violations unconditionally.

Every extracted value must be in `allowedNumbers(facts)`; otherwise it lands in
`violations` and `ok` is false. No exceptions, no normalization beyond the above.

### `src/lib/prose/prompt.ts`

`buildSystemPrompt(): string` (static) and `buildUserMessage(facts): string`
(= `renderFacts(facts)` output, nothing else — no raw JSON, so the model never sees
raw minute counts it might convert). System prompt, in this order:

1. **Goal**: one or two short sentences (≤ ~160 chars) explaining why this flight
   result stands out, for a card in a results list. Expert-friend tone (PRD): plainly
   confident, no marketing fluff, no exclamation marks.
2. **Hard rules**: use ONLY the numeric renderings given, quoted verbatim; never
   invent, convert, round, or approximate a number; no percentages; no vague
   quantities ("a couple", "about half"); don't enumerate every fact — pick the one
   to three most decision-relevant; mention the arrive-by deadline only when it
   sharpens the point.
3. **One held-out example** (input block → output line):

   ```
   stops: 1 stop
   duration: 16h 40m
   price: 98,000 miles + $112 (Aurora Award)
   badges: cheapest
   vs fastest: 1 more stop; 3h 25m slower; arrives 3h 25m later; 41,000 fewer miles
   ```
   →
   `The cheapest option here — one stop and 3h 25m slower than the fastest, but it saves 41,000 miles.`

### `src/lib/prose/openai-result-explainer.ts`

`OpenAIResultExplainer implements ResultExplainer`. Constructor
`(options?: { model?: string })`, model defaulting to
`process.env.ROTA_MODEL ?? 'gpt-5.6-luna'` (mirror the parser).

`explain(facts)` flow:

1. `generateText` with `openai(modelId)`, static system + rendered user message,
   `maxRetries: 1`, `maxOutputTokens: 300`,
   `providerOptions: { openai: { reasoningEffort: 'none' } }`. No
   temperature/top_p/stop. Plain text — no `Output.object`.
2. `candidate = text.trim()`. Fall back when: candidate is empty, longer than 300
   chars, or `checkNumberProvenance(candidate, facts)` fails.
3. Any thrown error (transport, SDK, anything) → fall back. This method NEVER throws.
4. Return `{ text: candidate, source: 'model' }` or
   `{ text: fallbackLine(facts), source: 'fallback' }`.

### Prose unit tests (all offline, in `pnpm test`)

- `render.test.ts`: duration edge cases (`0m` part omitted, `h === 0`), miles
  grouping, comparison sign words in both directions, `renderFacts` line omission,
  `fallbackLine` exact strings.
- `number-guard.test.ts`: accepts comma-grouped miles, `13h 35m` decomposition of a
  minutes total, `one more stop` when `|stopsDelta| === 1`, both `18:00` and the 12h
  `6` when `arriveBy: '18:00'`; rejects a foreign number (`40%`, `2 days`), a rounded
  duration (`about 14 hours` for 13h 35m), spelled compounds (`sixty-two thousand`),
  vague words (`a couple of stops`); does NOT flag `first class` or `nonstop`; and a
  property-style check that for several representative facts fixtures,
  `checkNumberProvenance(fallbackLine(f), f).ok === true` (the fallback must be
  guard-clean by construction).
- `openai-result-explainer.test.ts` with `MockLanguageModelV3` (mirror the technique
  in `src/lib/parser/openai-intent-parser.test.ts`): clean copy passes through with
  `source: 'model'`; copy with an uncomputed number → fallback; model throws →
  fallback; empty output → fallback; 300+-char output → fallback.

## Work item 3 — extend the import guard

In `src/lib/import-boundaries.test.ts`, add a prose allowlist test in the style of
the parser one: **prose non-test files import only LLM packages, zod, schema, engine,
and prose files.** (The existing "LLM packages only under parser/ and prose/" test
already whitelists the directory; this adds the outbound allowlist. Note prose may
import engine — unlike the parser — because `ExplanationFacts` and the renderers'
inputs are engine types; ARCHITECTURE's dependency arrows already say
`engine <- prose`.)

## Work item 4 — API routes (`src/app/api/`)

App-layer files; no import-guard changes needed (app sits atop everything), but app
files must not import LLM packages directly — they get parser/prose via the lib
modules (the existing repo-wide LLM-package test enforces this automatically).

### `src/app/api/deps.ts` — real-dependency wiring

```ts
export const DEFAULT_ORIGIN: Place = { iata: 'ORD', city: 'Chicago' }
export function isoToday(): string            // new Date().toISOString().slice(0, 10)
export function createParser(): IntentParser  // OpenAIIntentParser({ today: isoToday(), supportedPlaces: SUPPORTED_PLACES })
export function createProvider(): AvailabilityProvider // createSimulatedAvailability() — real delays, default seed
export function createExplainer(): ResultExplainer     // OpenAIResultExplainer()
```

### `src/app/api/sse.ts` — tiny SSE helper

`sseEvent(event: string, data: unknown): string` returning
`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`, plus a helper that turns an
`AsyncIterable<SourceBatch>` + an `AbortSignal` into an SSE `Response`
(`ReadableStream` of encoded events; headers `Content-Type: text/event-stream`,
`Cache-Control: no-cache, no-transform`, `Connection: keep-alive`). Stop iterating
when the signal aborts or the stream is cancelled; always emit the terminal `done`
event on normal completion, then close.

### `src/app/api/parse/route.ts`

```ts
export async function handleParse(request: Request, parser: IntentParser): Promise<Response>
export async function POST(request: Request): Promise<Response> // handleParse(request, createParser())
```

Body schema (zod, in this file): `{ currentIntent: tripIntentSchema, utterance:
z.string().min(1) }`. Flow:

1. Unparseable JSON or schema-invalid body → 400 `{ error: 'invalid_request',
   detail: <zod issues or message> }`.
2. `parser.parse(currentIntent, utterance)`. `ParserError` → 422/502 per decision 10.
3. `canonicalizePlaces` → `fillAssumptions(intent, { defaultOrigin: DEFAULT_ORIGIN })`
   → `fillDefaults`. (`UnknownPlaceError` is impossible post-gate — the parser
   membership check guarantees it; let it escape as a 500, do not catch it into a
   quieter shape.)
4. `checkGaps(normalized, parseResult.unhandled)` → 200 `{ intent, gap }`.

Tests `src/app/api/parse/route.test.ts` using a stub `IntentParser` (a plain object
with a `parse` fn) — cover:

- happy lazy utterance (stub returns dest NRT with drifted label "Tokyo, Japan",
  dates, travelers 2, all else null): 200; label canonicalized to "Tokyo"; origin
  filled `{ ORD, Chicago, assumed: true }`; cabin/travelers defaulted where null;
  `gap.kind === 'ready'`.
- destination null → `gap.kind === 'follow_up'` with the deterministic question.
- unhandled + destination present → `ready_with_notice` carrying the echo.
- unhandled + destination null → `follow_up` whose question contains the echo
  (D5 absorption).
- stub throws `ParserError('invalid_output')` → 422; `('transport')` → 502.
- malformed JSON body → 400; empty utterance → 400.

### `src/app/api/search/route.ts`

```ts
export const dynamic = 'force-dynamic'
export function handleSearch(request: Request, provider: AvailabilityProvider): Response
export function GET(request: Request): Response // handleSearch(request, createProvider())
```

Flow:

1. `intent` query param missing / not JSON / fails `tripIntentSchema` → 400
   `{ error: 'invalid_request', detail }`.
2. `toAvailabilityQuery(intent)` in try/catch → 400 `{ error: 'not_searchable',
   detail: <message> }` (null destination or dates; origin should be pre-filled by
   `/api/parse` but a null origin fails here too, correctly).
3. SSE response via the item-4 helper over `provider.search(query)`: one `batch`
   event per `SourceBatch` (JSON payload is the batch verbatim — raw options,
   decision 1), then `done` with `{}`.

Tests `src/app/api/search/route.test.ts` injecting
`createSimulatedAvailability({ delay: () => Promise.resolve() })` (instant, still
fully deterministic) — cover:

- full stream: read `response.body` to completion, split on `\n\n`, parse events;
  all 4 sources appear; per-source `batchIndex` sequential with exactly one final
  batch; last event is `done`.
- determinism: two runs produce byte-identical event payloads.
- 400s: missing param, malformed JSON, schema-invalid intent, null destination.
- headers: `content-type: text/event-stream`.

No wall-clock timing assertions in tests — the latency shape is already pinned by
the availability suite, and live timing belongs to the operator smoke.

### `src/app/api/explain/route.ts`

```ts
export async function handleExplain(request: Request, explainer: ResultExplainer): Promise<Response>
export async function POST(request: Request): Promise<Response> // handleExplain(request, createExplainer())
```

Body schema: `{ facts: explanationFactsSchema }`. Invalid → 400. Valid →
`explainer.explain(facts)` (never throws) → 200 `{ text, source }`.

Tests `src/app/api/explain/route.test.ts` with a stub explainer: happy 200 shape;
schema-invalid facts (e.g. missing `vsCheapest` key) → 400 and the stub is never
called.

## Work item 5 — documentation updates

1. **ARCHITECTURE.md**
   - Module map, `app/` blurb: name the three routes and one line each on their
     contracts (parse = steps 1–3 + gaps → `{ intent, gap }`; search = GET SSE of raw
     source batches; explain = client-computed facts → guarded copy).
   - Module map, `prose/` blurb: explainer returns `{ text, source }`, never throws;
     guard = derived-allowlist over digits and number words; guard failure → the
     deterministic fallback template, no retry.
   - "The LLM boundary, precisely": update `ResultExplainer` to
     `explain(facts: ExplanationFacts): Promise<Explanation>` and add a short prose
     paragraph beside the parser one (prompt carries pre-rendered numeric strings;
     no feedback retry — fallback instead; rationale one line: prose is decorative,
     parse is load-bearing).
   - Pipeline step 6: clarify division of labor — server streams raw batches;
     client runs filter/rank/best-match/facts with the same engine code; prose is
     fetched per top result from `/api/explain`.
   - Allowlist paragraph: add the prose outbound allowlist (LLM packages, zod,
     schema, engine, prose).
   - Testing strategy: add bullets for prose (guard/render/explainer unit tests,
     fallback guard-clean property) and routes (handler tests with injected deps,
     instant-delay provider, no Next runtime).
2. **CONTEXT.md** (glossary only)
   - Add **Fallback template**: the deterministic why-this-result line rendered from
     ExplanationFacts when the model's copy fails the number-provenance guard (or the
     call fails); always guard-clean by construction; the reason prose can fail
     safe without retrying. _Avoid_: error message, placeholder.
   - Add **Rendered values**: the engine-formatted numeric strings ("13h 35m",
     "145,000 miles + $48") handed to the prose model to quote verbatim — the model
     phrases around numbers it was given, it never formats or converts one.
   - Number-provenance guard entry: append one sentence — the allowed set includes
     deterministic display decompositions (hours/minutes, 12h clock), so recognizing
     an engine number in copywriter form is not the model originating one.
3. **ROADMAP.md**
   - Status: mark M4 done (2026-07-11) with a one-liner (three routes, prose module,
     guard + fallback, test count); Current → M5.
   - M4 section: check off the bullets and fix wording to what shipped (`GET
     /api/search` SSE; add the `POST /api/explain` bullet; note "Done when" satisfied
     by handler tests + operator curl smoke).
   - Add a "Decided during M4 prep" list mirroring the Locked decisions table above,
     one line each, in the style of the M1 section.
4. **New ADR** `docs/adr/0007-thin-search-stream-and-prose-fallback.md`, in the
   existing ADR house style (Context, Decision, Why this shape, Considered and
   rejected). Covers three joined decisions: (a) the search stream carries raw
   batches and the CLIENT computes filter/rank/facts with the isomorphic engine,
   posting facts to `/api/explain` for phrasing; (b) prose never retries — guard
   failure falls back to the deterministic template (asymmetry with the parser's
   feedback retry is deliberate: parse blocks the product, prose is flourish, and
   the fallback is already correct); (c) the guard admits deterministic display
   decompositions of engine numbers (h/m, 12h clock) — derivation is code, so
   provenance still traces to the engine. Rejected: server-side rank + facts
   enrichment inside the stream (duplicates client state, breaks instant local
   re-rank, contradicts the isomorphic-engine design); a prose feedback retry
   (latency for flourish); spelled-number compound parsing in the guard (complexity
   with no payoff — prompt mandates digit renderings, compounds just fall back).

## Verification (must all pass before you finish)

```
pnpm typecheck
pnpm test        # all suites incl. new guard test, prose, facts-schema, and route handlers — no network
```

Do not commit. Leave the working tree for review. Report: files changed, test
counts, and anything you deviated on (deviations require a stated reason).

### Operator curl smoke (do NOT run this yourself — reference only)

Recorded here so the plan is self-contained; the operator runs it against the dev
server to sign off the ROADMAP "Done when" (lazy utterance → parsed intent →
streamed batches, under budget):

```sh
EMPTY='{"travelers":null,"origin":null,"destination":null,"cabin":null,"dates":null,"priority":null,"constraints":{"nonstop":null,"arriveBy":null,"departAfter":null,"avoidRedeye":null,"avoidLateArrival":null}}'

curl -s localhost:3000/api/parse -H 'content-type: application/json' \
  -d "{\"currentIntent\":$EMPTY,\"utterance\":\"tokyo in feb for 2\"}"
# expect: origin ORD assumed, NRT, feb window, travelers 2, cabin economy, gap.kind ready

INTENT='<the intent object from the parse response>'
curl -sN -G localhost:3000/api/search --data-urlencode "intent=$INTENT" \
  -w '\nTTFB %{time_starttransfer}s, total %{time_total}s\n'
# expect: first batch event well under 1s, done event, total ~3s

curl -s localhost:3000/api/explain -H 'content-type: application/json' \
  -d '{"facts": <ExplanationFacts computed from a streamed option>}'
# expect: { "text": ..., "source": "model" } with only engine numbers in text
```

## Explicitly out of scope

- Any UI (M5): chips, skeletons, EventSource client code, diff animation.
- Computing IntentDiff in any route (client-side, M5).
- Streaming the parser's partial object to open search early (the ARCHITECTURE
  "optional upgrade" — only if the live budget fails, and that's an operator call).
- A `seed` query param on `/api/search`, POST variant, reconnection/resume
  semantics, rate limiting, auth, CORS.
- Prompt tuning for prose beyond the spec; any live LLM calls or evals.
- Any change to `trip-intent.ts`, `engine/types.ts` interfaces, or the M2/M3 seam.
