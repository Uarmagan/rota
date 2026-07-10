# Rota — Roadmap

Working order and status. [PRD.md](PRD.md) says what and why, [ARCHITECTURE.md](ARCHITECTURE.md)
says where and how, this says when. Update the checkboxes as work lands; move decided
items from Open decisions into the schema/PRD and note the choice inline.

## Status

- **Done:** M0 foundations (commit `657cb70`). Build, typecheck, 36 tests green.
- **Current:** M1 is blocked on decisions D1/D2. M2 and M3 are unblocked and can start
  any time, in parallel.

## Open decisions

Blocking M1 (the parser prompt is built around the schema, so these change its contract):

- [ ] **D1 — Price preference.** The PRD accepts "cheap" as input but the schema can't
      hold it. Add a ranking-preference field (lean: yes, small enum) or descope via
      PRD edit.
- [ ] **D2 — `unhandled` field.** Should the parser re-emit an `unhandled: string | null`
      for clauses it can't map (e.g. "exactly one connection"), so the engine can
      surface a deterministic follow-up instead of silently dropping them? Lean: yes.

Non-blocking, decide before the schema is considered frozen:

- [ ] **D3 — Multi-airport metros.** Registry currently lists NRT before HND and
      first-entry-wins for bare city names. Alternative: metro codes (TYO).
- [ ] **D4 — Generalize `assumed` beyond origin?** Travelers/cabin currently stay null
      and the engine defaults silently at search time — slight tension with PRD
      principle 1 ("From: Chicago (assumed)" chip vs. invisible default to economy/1).
- [ ] **D5 — Exploratory destinations.** "somewhere warm in march" currently degrades
      to the missing-destination follow-up, and "warm" is not preserved. Ratify that
      as MVP behavior (PRD edit) or add destination-theme state.

## M0 — Foundations ✅

Scaffold (Next 16 / TS 5 strict / Tailwind 4 / Vitest / ai@6 + openrouter provider@2),
TripIntent schema + IntentDiff types + place registry, engine normalize/diff/gaps,
7-fixture parser set with self-consistency tests, allowlist import guards, ARCHITECTURE.md.

## M1 — Parser (blocked on D1, D2)

The LLM boundary for words → TripIntent.

- [ ] `IntentParser` interface + OpenRouter implementation (`generateText` +
      `Output.object`, response-healing enabled, model from `ROTA_MODEL`)
- [ ] System prompt: full-state re-emission rules, ParserContext (today +
      supportedPlaces), hostile-input identity policy
- [ ] Parse wrapper: Zod gate → `canonicalizePlaces` → retry/heal on rejection
- [ ] Live-model eval script running the fixture suite (`npm run eval`), reusing the
      fixture assertions
- [ ] Expand fixtures to the PRD's 20–25: typos, relative dates ("next friday"),
      more refinement-against-state, contradiction, more hostile
- **Done when:** eval passes the full fixture set against the default model, and the
  self-consistency suite still passes without network.

## M2 — Engine completion (unblocked)

The deterministic core over flight data. Pure TS, no mocks.

- [ ] `types.ts`: `FlightOption` (segments, times, duration, stops, cabin, source,
      award price) + `ExplanationFacts`
- [ ] `filter.ts`: apply all TripIntent constraints (incl. `avoidLateArrival` /
      red-eye windows — engine defines 00:00–05:00 local)
- [ ] `rank.ts`: scoring + best-match, stable under incremental batches
      (nonstop 'preferred' boosts, 'required' filters)
- [ ] `pricing.ts`: award pricing math (miles + fees) from generator inputs
- [ ] `explain.ts`: computed comparisons within the result set
- **Done when:** every module unit-tested; import-boundary guard still green.

## M3 — Availability simulation (unblocked)

- [ ] `AvailabilityProvider` interface + 3–4 fictional sources
- [ ] Seeded flight generator: realistic shapes, scarce premium cabins, variable pricing
- [ ] Per-source latency profiles; first batch ≤ 600ms (the <3s budget in
      ARCHITECTURE.md depends on this)
- **Done when:** seeded runs are deterministic in tests; batch ordering and latency
  shape asserted.

## M4 — API routes (needs M1 + M3)

- [ ] `POST /api/parse`: `{currentIntent, utterance}` → full TripIntent (pipeline
      steps 1–3)
- [ ] `GET/POST /api/search`: ReadableStream/SSE of source batches
- [ ] `prose/` ResultExplainer + number-provenance guard (digits AND number words)
- **Done when:** curl-level smoke: lazy utterance → parsed intent → streamed batches,
  timed under budget.

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
