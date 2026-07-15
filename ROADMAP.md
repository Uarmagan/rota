# Rota — Roadmap

Working order and status. [PRD.md](PRD.md) says what and why, [ARCHITECTURE.md](ARCHITECTURE.md)
says where and how, this says when. Update the checkboxes as work lands; move decided
items from Open decisions into the schema/PRD and note the choice inline.

## Status

- **Done:** M0 foundations (commit `657cb70`). All D1–D5 decisions resolved and the
  schema is considered frozen for MVP (D1 `priority`, D2 `ParseResult`/`unhandled` +
  `GapOutcome`, D3 single-airport registry, D4 defaults, D5 exploratory follow-up).
  Typecheck + 70 tests green.
- **Done:** M1 parser (2026-07-10; challenge hardening 2026-07-14): parser seam,
  retry policy, direct `@ai-sdk/openai` with default `gpt-5.6-luna`, few-shot prompt,
  and `pnpm eval`. The corpus now has 47 canonical fixtures and 59 expanded eval
  cases; the strict tier has 19 canonical fixtures and 31 expanded cases.
  The original live eval passed 25/25 fixtures (125/125 reps, 0 retries, ~1.05s p50);
  the post-hardening full corpus passed 38/38 (190/190 reps, 0 retries,
  0.96–1.22s per-fixture p50) after eval-driven grammar-vs-place, representable-clue,
  and correction-policy fixes. The expanded strict matrix passed 31/31 cases
  (155/155 reps, 0 retries) on 2026-07-14.
- **Done:** M2 deterministic engine (2026-07-10): filtering, ranking, pricing,
  explanation facts, local-clock helpers, and visible defaults. All 54 focused engine
  tests pass.
- **Done:** M3 simulated availability (2026-07-10): four deterministic fictional
  sources, seeded inventory, seat scarcity, and ordered latency-shaped batches. All
  30 focused availability/boundary tests pass.
- **Done:** M4 API routes + prose (2026-07-11): three thin handlers, raw-batch SSE,
  guarded result prose, and deterministic fallback. The full suite passes 268 tests
  across 25 files.
- **Current:** M7 demo hardening. Strict parser challenge coverage is implemented;
  the end-to-end demo walkthrough and hostile-input behavior through the real UI
  remain.

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

- [x] **D3 — Multi-airport metros.** DECIDED for M0: one airport per city for MVP; dropped HND
      so every city resolves unambiguously (no soft LLM airport choice). Multi-airport
      metro codes (TYO expanded to member airports at search) deferred to phase 2 — the
      abstraction is disproportionate when only Tokyo ever had two airports, and no
      demo-path utterance needs it. See docs/adr/0003. (PLACES_VERSION bumped to
      2026-07-10.1.) Superseded in M6 by ADR 0008: registry-order bare-city
      resolution now supports multiple airports without adding metro codes.
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
      supportedPlaces + versioned airport aliases), hostile-input identity policy
- [x] Parse wrapper: Zod gate + registry-membership gate → one feedback retry;
      canonicalization remains the next engine pipeline step
- [x] Live-model eval script running the fixture suite (`pnpm eval`), reusing the
      fixture assertions
- [x] Maintain a core fixture corpus plus strict challenge cases: typos, relative
      dates, refinement-against-state, contradiction, hostile input, named-party
      inference, fragments, and compositional corrections
- **Done when:** eval passes the full fixture set against the default model, and the
  self-consistency suite still passes without network.

### Decided during M1 prep

- Parser returns raw, pre-canonicalization `ParseResult` and never imports engine.
- One feedback retry covers validation and membership; the SDK owns transport retry.
- OpenAI is called directly; default model is `gpt-5.6-luna` at lowest reasoning.
- Prompt uses four full input/output examples disjoint from the fixture utterances;
  concise inline policy illustrations may clarify semantics but stay disjoint from
  strict challenge cases.
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
      cash price) + `ExplanationFacts`
- [x] `filter.ts`: apply all TripIntent constraints (incl. `avoidLateArrival` /
      red-eye windows — engine defines 00:00–05:00 local)
- [x] `rank.ts`: scoring + best-match, stable under incremental batches
      (nonstop 'preferred' boosts, 'required' filters)
- [x] `pricing.ts`: cash party-total math from generator inputs
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

- [x] Single input, chips row rendered from TripIntent, diff-driven change animation
- [x] Assumed-origin chip label + one-tap edit (chip taps skip the parser)
- [x] Direct editors for every rendered intent chip, with schema-valid engine
      transitions and parser-free re-search
- [x] Targeted follow-up rendering (gap policy)
- [x] Streaming results grouped by source: skeletons, arrival animation, live
      best-match re-badging
- [x] "Why this result" line from prose module
- [x] Keyboard-accessible result summaries with inline deterministic details
- **Done when:** the PRD's 60-second demo path works end to end by hand
  (initial UI landed 2026-07-11; complete direct editing and result expansion
  landed 2026-07-13; the by-hand walkthrough is still owed — tracked in issue #5).

### Decided during M5 prep

- Design picked by prototype (issue #5): three variants on `/`, winner "Palette" —
  dark command-bar where the utterance becomes chips in the same panel and the
  input clears; a failed parse (422) restores the typed text with a rephrase
  prompt. Primary source: branch `prototype/search-ui-variants`.
- The client is the engine's second runtime, per ARCHITECTURE: raw batches stream
  in, filter/rank/best-match/facts run in the browser, `/api/explain` phrases the
  facts. Chip diffs are computed client-side from the previous chip state.
- Missing dates block search in the UI with a prompting "When?" chip (deterministic
  copy, not a gap question) — `checkGaps` only hard-blocks on destination, and
  whether dates deserve promotion to a real follow-up is an open M6 question.
- Filtered-out inventory is visible ("n options hidden by your filters"), keeping
  principle 1 honest at the results layer.
- M5 originally shipped with native chip-editor controls and no component library.
  Revisited for M7: adopt shadcn selectively for the chip-editor primitive layer and
  give those controls a focused visual refresh. Preserve the custom chip shell, Palette
  search surface, results layout, overall color language, and existing diff motion.

## M6 — Google-Flights pivot

- [x] Expand the versioned registry with registry-order metro resolution
- [x] Generate real airline identities on labeled simulated inventory
- [x] Derive route durations from airport geometry and static UTC offsets
- [x] Replace points pricing with whole-dollar cash fares and party totals
- [x] Preserve deterministic ranking, prose number provenance, and API contracts
- [x] Relayout the UI as a merged ranked list with airline rows and a persistent
      simulated-data label (2026-07-14): one rank-ordered list that FLIPs rows to
      their new position on re-rank, airline names + flight numbers from segment
      codes, price-forward rows, expandable itinerary details with layovers, and
      a stream-status header (options · hidden-by-filters · sources answered).
- **Status:** Done (2026-07-14). Full suite green (364 tests, incl. jsdom
  interaction tests for the results list). Remaining by-hand demo walkthrough
  belongs to M7.

## M7 — Demo hardening

- [x] Maintain a strict parser challenge tier (19 canonical fixtures, 31 expanded
      cases) for named-party inference, named airports, noisy fragments, metamorphic
      wording families, role/count minimal pairs, self-correction, explicit waivers,
      and unsupported place qualifiers
- [x] Refresh chip-editor primitives with selectively styled shadcn components while
      preserving the surrounding Palette UI and product-specific chip behavior
- [ ] Walk the demo path against the success criteria: first result <3s, three-utterance
      refinement journey, zero LLM numbers (guard verified in an e2e pass)
- [ ] Graceful degradation pass on hostile fixtures through the real UI
- [x] README with run instructions and a verified live-demo screenshot (2026-07-14)
- **Done when:** a first-time viewer understands it in one query, no narration.

### Decided during M7 chip-editor refresh

- The Date window editor uses one shadcn Calendar with an Exact/Flexible segmented
  control. Exact selects one calendar day; Flexible selects and visibly highlights an
  earliest-to-latest range, preserving the existing DateWindow schema.
- Origin and Destination use searchable shadcn Combobox editors with city and IATA
  matching, keyboard navigation, and a visible current selection. Picking the current
  assumed origin confirms it, preserving the existing assumption transition.
- Travelers, Cabin, Priority, Nonstop, Red-eyes, and Late arrival use one consistent
  shadcn Dropdown Menu pattern: direct options, a checked current value, and a Clear
  action only for fields whose schema permits null. Avoid nesting Select inside a
  Popover for these one-step choices.
- Arrive-by and Depart-after use a styled native `type="time"` control through the
  shadcn Input primitive inside a refreshed Popover, with explicit Apply and Clear
  buttons. Preserve exact `HH:mm` values rather than imposing fixed time increments.
- Airport picks and complete calendar choices commit immediately and close their
  editor. Exact dates commit on one day; Flexible dates commit only after both range
  endpoints exist. Time edits retain Apply so partial typed values never re-search.
- Airport, Date window, and Time editors use anchored Popovers on desktop and shadcn
  Drawers on narrow mobile screens. Simple-choice Dropdown Menus remain anchored on
  both layouts. The responsive editor changes do not alter the surrounding Palette UI.
- Keep chip triggers at their current compact density. Open editors use roomier
  36–40px rows, clearer hover/selected states, and quiet Lucide icons. Their tokens stay
  in Rota's charcoal, fine-white-border, indigo-selection language; amber remains
  reserved for assumptions.
- Initialize shadcn on Base UI primitives, not Radix. Add only the primitives needed
  by the chip-editor refresh and preserve Rota's existing global Palette styling rather
  than accepting a generated app-wide theme reset.

## Explicitly parked (phase 2, per PRD)

Points-intelligence layer, real availability, round-trip/multi-city, accounts, hosted
eval dashboards and longitudinal reporting, hotels/cars, mobile-native.
