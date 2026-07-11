# Rota — Roadmap

Working order and status. [PRD.md](PRD.md) says what and why, [ARCHITECTURE.md](ARCHITECTURE.md)
says where and how, this says when. Update the checkboxes as work lands; move decided
items from Open decisions into the schema/PRD and note the choice inline.

## Status

- **Done:** M0 foundations (commit `657cb70`). All D1–D5 decisions resolved and the
  schema is considered frozen for MVP (D1 `priority`, D2 `ParseResult`/`unhandled` +
  `GapOutcome`, D3 single-airport registry, D4 defaults, D5 exploratory follow-up).
  Typecheck + 70 tests green.
- **Done:** M1 parser (2026-07-10): parser seam, retry policy, direct `@ai-sdk/openai`
  with default `gpt-5.6-luna`, few-shot prompt, 25 fixtures, `pnpm eval`. Live eval
  passed 25/25 fixtures (125/125 reps, 0 retries, ~1.05s p50) after one eval-driven
  policy flip (`next <weekday>`, below).
- **Done:** M2 deterministic engine (2026-07-10): filtering, ranking, award pricing,
  explanation facts, local-clock helpers, and visible defaults. All 54 focused engine
  tests pass.
- **Done:** M3 simulated availability (2026-07-10): four deterministic fictional
  sources, seeded inventory, seat scarcity, and ordered latency-shaped batches. All
  30 focused availability/boundary tests pass.
- **Done:** M4 API routes + prose (2026-07-11): three thin handlers, raw-batch SSE,
  guarded result prose, and deterministic fallback. The full suite passes 268 tests
  across 25 files.
- **Current:** M5 UI.

## Open decisions

Blocking M1 (the parser prompt is built around the schema, so these change its contract):

- [x] **D1 — Price preference.** DECIDED: add top-level `priority: 'cheapest' |
      'fastest' | null`. A ranking preference (reweights the scoring blend), never a
      filter — no result drops, and no user-facing number is invented. Top-level, not
      in `constraints`: it's two-state (no coherent `false`) so it fails the tri-state
      test that defines constraint membership, and it never gates results. Single enum
      makes "cheap and fast" unrepresentable by design, dodging a contradiction.
- [x] **D2 — `unhandled` field.** DECIDED: yes, but *beside* TripIntent, not on it.
      Parser returns `ParseResult { intent: TripIntent; unhandled: string | null }`.
      `unhandled` is transient (fresh per utterance, never persisted), never a chip,
      never diffed — for recognized-but-unsupported clauses only (parse failures still
      take the Zod-gate → feedback-retry path). Shape is a single `string | null`:
      echo-only display text quoting the user's clause back (readably formatted),
      introducing no new numbers/facts — a sanctioned carve-out to the number-provenance
      invariant (provenance is the user, not the model). Engine reaction: non-blocking.
      `GapOutcome` gains `ready_with_notice` (search streams AND the echo renders);
      missing destination still hard-blocks and is adjudicated first;
      `checkGaps(intent, unhandled)` decides both.
      UI note (M5, non-blocking): gaps surface as chip-row prompting states (empty chip
      + registry typeahead), never chat bubbles or modals — there is no chat surface.

Non-blocking, decided before freezing the schema:

- [x] **D3 — Multi-airport metros.** DECIDED: one airport per city for MVP; dropped HND
      so every city resolves unambiguously (no soft LLM airport choice). Multi-airport
      metro codes (TYO expanded to member airports at search) deferred to phase 2 — the
      abstraction is disproportionate when only Tokyo ever had two airports, and no
      demo-path utterance needs it. See docs/adr/0003. (PLACES_VERSION bumped to
      2026-07-10.1.)
- [x] **D4 — Generalize `assumed` beyond origin?** DECIDED: no. Three field states —
      stated, assumed, defaulted. Unstated cabin/travelers are FILLED in normalization
      (economy, 1) and shown as plain editable chips, so nothing is silently decided
      (principle 1), but the "(assumed)" flag stays origin-only to keep the signal
      undiluted. Cheapest schema path (no new field types). Escalating a field to a
      flagged assumption later is additive. See docs/adr/0004. NOTE: the defaulting code
      lands with the M2 engine/normalization; this decision precedes it.
- [x] **D5 — Exploratory destinations.** DECIDED: no theme→destination search in MVP
      (phase 2; the registry has no warm places anyway). But the theme is not dropped —
      D2 captures "somewhere warm" in `unhandled`, and since destination stays null the
      missing-destination follow-up ABSORBS the echo (one question that acknowledges what
      we couldn't use AND asks where to). Refines the D2 ordering. Added the marquee
      `exploratory-warm-march-cheap` fixture (exercises D1+D2+D5). PRD example reframed.
      See docs/adr/0005.

## M0 — Foundations ✅

Scaffold (Next 16 / TS 5 strict / Tailwind 4 / Vitest / ai@6 + openrouter provider@2),
TripIntent schema + IntentDiff types + place registry, engine normalize/diff/gaps,
7-fixture parser set with self-consistency tests, allowlist import guards, ARCHITECTURE.md.

## M1 — Parser ✅

The LLM boundary for words → TripIntent.

- [x] `IntentParser` returning `ParseResult` + direct OpenAI implementation
      (`generateText` + `Output.object`, model from `ROTA_MODEL`)
- [x] System prompt: full-state re-emission rules, ParserContext (today +
      supportedPlaces), hostile-input identity policy
- [x] Parse wrapper: Zod gate + registry-membership gate → one feedback retry;
      canonicalization remains the next engine pipeline step
- [x] Live-model eval script running the fixture suite (`pnpm eval`), reusing the
      fixture assertions
- [x] Expand fixtures to the PRD's 20–25: typos, relative dates ("next friday"),
      more refinement-against-state, contradiction, more hostile
- **Done when:** eval passes the full fixture set against the default model, and the
  self-consistency suite still passes without network.

### Decided during M1 prep

- Parser returns raw, pre-canonicalization `ParseResult` and never imports engine.
- One feedback retry covers validation and membership; the SDK owns transport retry.
- OpenAI is called directly; default model is `gpt-5.6-luna` at lowest reasoning.
- Prompt uses four held-out examples disjoint from the fixture utterances.
- The model resolves relative dates; Zod refinements remain the hard date gate.
- Eval runs five reps; hostile fixtures require 5/5 and all others at least 4/5.
- Unsupported cities become `unhandled` with a null place, never a fabricated IATA.
- Later clauses win utterance-internal contradictions.
- `next <weekday>` is that weekday of the FOLLOWING Mon-Sun week (bare "friday"/"this
  friday" is the next occurrence); following week means next Mon-Sun week. Flipped
  from strictly-after-today on live-eval evidence: the model, like most speakers,
  reads "next friday" across the week boundary (3/10 before vs 10/10 after).
- Hostile and meta-instruction text is dropped silently and never echoed.

## M2 — Engine completion ✅

The deterministic core over flight data. Pure TS, no mocks.

- [x] `types.ts`: `FlightOption` (segments, times, duration, stops, cabin, source,
      award price) + `ExplanationFacts`
- [x] `filter.ts`: apply all TripIntent constraints (incl. `avoidLateArrival` /
      red-eye windows — engine defines 00:00–05:00 local)
- [x] `rank.ts`: scoring + best-match, stable under incremental batches
      (nonstop 'preferred' boosts, 'required' filters)
- [x] `pricing.ts`: award pricing math (miles + fees) from generator inputs
- [x] `explain.ts`: computed comparisons within the result set
- **Done when:** every module unit-tested; import-boundary guard still green.

## M3 — Availability simulation ✅

- [x] `AvailabilityProvider` interface + 3–4 fictional sources
- [x] Seeded flight generator: realistic shapes, scarce premium cabins, variable pricing
- [x] Per-source latency profiles; first batch ≤ 600ms (the <3s budget in
      ARCHITECTURE.md depends on this)
- **Done when:** seeded runs are deterministic in tests; batch ordering and latency
  shape asserted.

## M4 — API routes + prose ✅

- [x] `POST /api/parse`: `{ currentIntent, utterance }` → normalized
      `{ intent, gap }` (pipeline steps 1–3 plus deterministic gap policy)
- [x] `GET /api/search`: ReadableStream/SSE of raw source batches, then `done`
- [x] `POST /api/explain`: schema-gated client-computed facts → guarded copy
- [x] `prose/` ResultExplainer + number-provenance guard (digits AND number words) +
      deterministic fallback
- **Done when:** handler tests cover the three contracts and the recorded operator curl
  smoke signs off the live lazy-utterance → parsed-intent → streamed-batches budget.

### Decided during M4 prep

- Search SSE carries raw `SourceBatch` values; the client owns filter, rank,
  best-match, and facts computation with the isomorphic engine.
- `/api/parse` runs parse, canonicalization, assumption/default filling, and gaps;
  IntentDiff stays client-side presentation state.
- Search is `GET` with the complete intent as URL-encoded JSON and terminal `done` SSE.
- Exported web-standard handlers inject parser, provider, and explainer dependencies.
- ResultExplainer returns `{ text, source }`, never throws, and falls back without a
  feedback retry.
- The number guard admits only fact-derived numeric values and display decompositions;
  vague quantity words always fail.
- The prose prompt receives deterministic rendered strings and uses plain
  `generateText` at no reasoning effort.
- `/api/explain` validates through an engine-owned Zod schema pinned to
  `ExplanationFacts`.
- App wiring uses UTC `isoToday()` and assumes `{ ORD, Chicago }` when origin is absent.
- HTTP status contracts distinguish invalid requests, parser output failures,
  transport failures, and non-searchable intents.

## M5 — UI (needs M4; PRD says it earns nothing until the loops work)

- [ ] Single input, chips row rendered from TripIntent, diff-driven change animation
- [ ] Assumed-origin chip label + one-tap edit (chip taps skip the parser)
- [ ] Targeted follow-up rendering (gap policy)
- [ ] Streaming results grouped by source: skeletons, arrival animation, live
      best-match re-badging
- [ ] "Why this result" line from prose module
- **Done when:** the PRD's 60-second demo path works end to end by hand.

## M6 — Demo hardening

- [ ] Walk the demo path against the success criteria: first result <3s, three-utterance
      refinement journey, zero LLM numbers (guard verified in an e2e pass)
- [ ] Graceful degradation pass on hostile fixtures through the real UI
- [ ] README with run instructions
- **Done when:** a first-time viewer understands it in one query, no narration.

## Explicitly parked (phase 2, per PRD)

Points-intelligence layer, real availability, round-trip/multi-city, accounts, full
eval-harness reporting, hotels/cars, mobile-native.
