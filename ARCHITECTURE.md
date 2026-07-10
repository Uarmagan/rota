# Rota — Architecture

Companion to [PRD.md](PRD.md). The PRD says what and why; this says where and how. Every
structural decision here exists to make a PRD principle enforceable in code rather than
by convention.

## Stack (locked)

- Next.js App Router, TypeScript strict mode
- AI SDK v6: `generateText` / `streamText` with `Output.object` (the deprecated
  `generateObject` / `streamObject` are banned)
- `@openrouter/ai-sdk-provider` with the response-healing plugin enabled
- Model configurable via env (`ROTA_MODEL`, default `deepseek/deepseek-chat`)
- Zod, Tailwind, Vitest

## Module map

```
src/
  lib/
    schema/         Shared vocabulary. TripIntent Zod schema + inferred types,
                    IntentDiff types, and the canonical place registry
                    (places.ts). Depends on zod only. No logic.
    engine/         The deterministic core. Pure TypeScript, zero framework and
                    zero LLM dependencies. Fully unit-testable without mocks.
                      normalize.ts  canonicalizePlaces: map every parser-emitted
                                    IATA code to its registry entry (discarding
                                    model-authored city labels), reject unknown
                                    codes. fillAssumptions: null origin -> the
                                    configured default with assumed: true.
                      diff.ts       computeIntentDiff(prev, next) -> IntentDiff,
                                    always over normalized intents
                      gaps.ts       follow-up policy: destination missing or
                                    contradictory representable constraints ->
                                    one targeted question
                      filter.ts     apply TripIntent constraints to flight options
                      rank.ts       scoring + best-match selection, stable under
                                    incremental arrival of results
                      pricing.ts    simulated award pricing math (miles + fees)
                      explain.ts    ExplanationFacts: computed comparisons within
                                    the result set ("fastest under arrive-by",
                                    "lands 6h earlier than cheapest")
                      types.ts      FlightOption and other engine domain types
    parser/         LLM boundary #1. IntentParser interface +
                    OpenRouterIntentParser implementation, system prompt,
                    committed fixture set. One generateText call with
                    Output.object against the TripIntent schema, Zod-gated.
                    Depends on schema, never on engine.
    availability/   AvailabilityProvider interface + simulated sources with
                    realistic per-source latency profiles and scarce premium
                    inventory. Fake data, real async streaming. Seedable for
                    deterministic tests.
    prose/          LLM boundary #2. ResultExplainer interface: turns
                    ExplanationFacts into one or two lines of copy. Includes the
                    number-provenance guard (below).
  app/              Next.js layer. Thin orchestration only: pages, API routes,
                    streaming plumbing. No business logic.
```

Dependency direction (anything else is a violation):

```
schema  <-  engine  <-  app
schema  <-  parser  <-  app
engine  <-  availability, prose  <-  app
```

Enforced as an **allowlist**, not a denylist: a Vitest guard asserts (a) files under
`src/lib/engine` import only `zod`, `src/lib/schema`, and other engine files, and (b)
`ai` and `@openrouter/*` are imported only under `src/lib/parser` and `src/lib/prose` —
repo-wide, so an app route can't sprout a stray LLM call either. Because the engine is
pure TS with no framework dependency, it runs identically on the server and in the
client bundle — the client re-ranks streamed results locally with the same code the
tests exercise.

## The intent pipeline

Every utterance — initial search and refinement are the same code path, initial is just
the empty-current-intent case — runs one pipeline. Order matters: the diff the UI
animates is computed between **normalized** states, after deterministic canonicalization
and assumption-filling, so chips never animate from label drift or fill later than the
diff.

```
(currentIntent, utterance)
  1. parser.parse()          LLM re-emits the COMPLETE TripIntent. Zod gate;
                             response-healing repairs malformed JSON. Never a patch.
  2. canonicalizePlaces()    engine, deterministic: every emitted IATA code maps to
                             its registry entry or the parse is rejected. Kills both
                             hallucinated codes and city-label drift ("Tokyo, Japan").
  3. fillAssumptions()       engine, deterministic: origin null -> configured default
                             with assumed: true. The parser NEVER invents an origin;
                             assumption is policy, and policy is engine code.
  4. computeIntentDiff()     engine: prev normalized state vs new normalized state.
                             Drives chip render/animation and nothing else — the diff
                             is presentation, the full intent is state.
  5. gaps()                  engine: destination missing or representable-constraint
                             contradiction -> one targeted follow-up. The LLM never
                             decides whether or what to ask.
  6. search stream           app/api/search (ReadableStream/SSE). Availability
                             sources respond batch-by-batch; each batch flows through
                             engine filter + rank incrementally; best-match badge
                             re-computes per batch. Top results get ExplanationFacts
                             (engine) phrased by prose.
```

Refinements ("actually business class, and nonstop if possible") POST the live chip
state as `currentIntent`. Chips are the source of truth — the conversation transcript is
never sent, never stored, never consulted. Removal ("forget the nonstop thing") is
re-emission with that field back to `null`. Once an assumed origin is in chip state, the
parser edits it like any other field: "actually from SFO" replaces it, a confirmation
flips `assumed` to `false`.

Chip taps take a shortcut: they edit the TripIntent directly on the client and skip
steps 1–3. Same diff, same re-search.

### Latency budget

The pipeline is sequential — search cannot open until parse produces destination and
dates. The PRD's under-3-seconds criterion is met by budget, not by pretending
otherwise: parse with a small model ~1.5–2s, steps 2–5 sub-millisecond, and the first
simulated source configured to answer in 300–600ms (availability latency is ours to
choose — fake data, honest transport, tuned so partial answers land fast). Optional
upgrade if parse proves slow, not assumed by the design: stream the parser's partial
object and open the search as soon as destination + dates validate.

## Where each PRD principle is enforced

| PRD principle | Enforcement point |
|---|---|
| 1. The AI never silently decides | Every interpretable field in `schema` is `.nullable()`; origin carries `assumed: boolean`. The parser never fills a gap: `engine/normalize.ts` owns assumption-filling and `engine/gaps.ts` owns the follow-up policy, both as pure, tested logic. Chips render only from TripIntent, so nothing that was decided can stay invisible. |
| 2. The AI interprets, the engine computes | LLM calls exist in exactly two modules — `parser` (words → TripIntent, Zod-gated, then deterministically canonicalized) and `prose` (ExplanationFacts → copy) — enforced by the repo-wide allowlist guard. `prose` output passes a number-provenance guard: every digit sequence and spelled-out number word in the copy must correspond to a value in the input facts, else the copy is rejected and a deterministic fallback template renders. The guard enforces provenance (no number can originate from the LLM), not claim-binding; binding correctness comes from keeping ExplanationFacts minimal and per-result. |
| 3. Conversation edits state, not history | The parser signature `(currentIntent, utterance) => TripIntent` is the whole memory model — there is no chat log anywhere in the system. Full-state re-emission means unmentioned fields are preserved by instruction and **asserted by the fixture suite** (deep equality on the complete intent, made fair by canonicalization). IntentDiff is computed by `engine/diff.ts` over normalized states, never emitted by the model. |
| 4. Speed should feel alive | Sequential pipeline with an explicit latency budget (above). `availability` is interface-first with per-source latency simulation streamed over a real ReadableStream. Ranking is incremental and stable in `engine/rank.ts` so re-ranks are legible, not jumpy. |

## The LLM boundary, precisely

Two call sites, both behind interfaces so model/provider is swappable config:

```ts
interface IntentParser {
  parse(currentIntent: TripIntent, utterance: string): Promise<TripIntent>
}

interface ResultExplainer {
  explain(facts: ExplanationFacts): Promise<string>
}
```

The OpenRouter `IntentParser` is constructed with a request-scoped
`ParserContext { today, supportedPlaces }` (the registry, versioned in
`schema/places.ts`) so relative dates ("in feb") resolve against explicit, testable
inputs and the prompt only ever offers places the simulation knows. The default origin
is **not** parser context — it belongs to the engine's normalize config, because the
parser never uses it.

Hostile or nonsense input degrades to identity: an utterance that is primarily a
meta-instruction (prompt injection, out-of-domain demands, gibberish) re-emits
`currentIntent` unchanged — empty diff, no state damage. This policy cannot be enforced
deterministically (recognizing hostility is interpretation), so it is pinned by
fixtures instead, including hostile cases whose requested mutations are schema-valid —
Zod rejection must never be what masks a policy failure.

Zod refinements (real calendar dates, window ordering) do not survive conversion to the
JSON schema the model sees; they run in the post-parse Zod gate, where failures trigger
the response-healing/retry path.

## Testing strategy

- `engine`: plain Vitest unit tests, no mocks needed — that's the point of the purity
  constraint. Normalize (canonicalization + assumption-fill), diff, gaps, filter, rank,
  pricing, explain-facts all covered directly.
- `parser`: the committed fixture set (`src/lib/parser/fixtures.ts`) is the product
  requirement from PRD §6. The runner asserts, per fixture: (a) deep equality of
  `canonicalizePlaces(parsed)` against the **full** expected intent — preservation of
  unmentioned fields is structurally asserted, not spot-checked; (b) that
  `computeIntentDiff(currentIntent, result)` touches exactly the expected changed-field
  set. Assumption-filling is deliberately not applied in the runner: fixtures pin the
  parser stage (origin stays null on a first query); the fill is engine-tested
  separately. Runs against the live model as an eval script; the fixture data itself is
  model-independent.
- `availability`: seeded simulation, deterministic assertions on batch ordering and
  latency shape.
- Boundary guards: the allowlist import tests described in the module map.
