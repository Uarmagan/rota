# Rota — Glossary

The project's working vocabulary. Terms are grouped by concept, not alphabetized —
read top to bottom and you have the mental model.

## State and the intent pipeline

**TripIntent** — The single piece of state the whole product revolves around: a
structured description of the trip the user wants (travelers, origin, destination,
cabin, dates, constraints). Defined by the Zod schema in
[trip-intent.ts](src/lib/schema/trip-intent.ts). Every unstated field is `null`, never
missing. Chips render from it, searches run from it, and the conversation exists only
to edit it.

**Utterance** — One user message ("tokyo feb", "forget the nonstop thing"). Always
parsed *against* the current TripIntent, never against chat history — there is no chat
history.

**Full-state re-emission** — The parser contract: given the current intent and an
utterance, the LLM re-emits the **complete** updated TripIntent, preserving every
field the utterance didn't mention. It never emits a patch or a diff. Removing a
constraint is just re-emission with that field back to `null`. This is what makes
"conversation edits state" real instead of aspirational.

**Intent chips** — The UI rendering of TripIntent: one editable chip per field
(travelers, route, cabin, dates, each constraint). Per PRD principle 3, the chips are
the source of truth; the conversation is just the fastest way to edit them.

**IntentDiff** — The list of chip-level changes between two intents, each tagged
`set` (null → value), `changed`, or `cleared` (value → null). Computed
deterministically by [engine/diff.ts](src/lib/engine/diff.ts), **never** emitted by
the LLM. It drives chip animation and nothing else: the diff is presentation, the
full intent is state.

**The intent pipeline** — The fixed sequence every utterance runs through:
parse → canonicalize places → fill assumptions → diff → gaps → search. Initial search
and refinement are the same path; initial is just the empty-current-intent case.
Spelled out in [ARCHITECTURE.md](ARCHITECTURE.md).

**Normalization** — Steps 2–3 of the pipeline (canonicalization + assumption fill),
in [engine/normalize.ts](src/lib/engine/normalize.ts). Diff, gap policy, and search
only ever see *normalized* intents; that ordering guarantee is what keeps chips from
animating on label drift or filling after the diff was computed.

**Canonicalization (`canonicalizePlaces`)** — Deterministically mapping every
parser-emitted IATA code back to its place-registry entry, discarding whatever city
label the model wrote ("Tokyo, Japan" → registry's "Tokyo"), and rejecting codes the
registry doesn't know. Makes deep-equality a fair comparison and kills hallucinated
airports.

**Place registry / supported places** — The closed, versioned list of airports the
simulation knows ([places.ts](src/lib/schema/places.ts), `PLACES_VERSION`). The
parser prompt offers exactly these. Resolution policy: first entry for a city wins
for bare city names ("tokyo" → NRT).

**Assumption / `assumed` flag** — A low-risk gap filled with a labeled default
instead of a question: origin missing → "From: Chicago (assumed)", one tap to change.
The parser never invents an origin; `fillAssumptions` in the engine is the one place
an assumption enters state — assumption is policy, and policy is deterministic code.

**Gap policy** — The deterministic rules in [engine/gaps.ts](src/lib/engine/gaps.ts)
deciding what happens after a parse: low-risk gap → labeled assumption; high-risk gap
(no destination, contradictory constraints) → one targeted follow-up. The LLM never
decides whether or what to ask.

**Targeted follow-up** — The single clarifying question a high-risk gap earns
("Where do you want to fly to?"). Never a wall of questions; the copy is a
deterministic template, not LLM output.

## The LLM boundary

**LLM boundary** — The two modules, and only two, allowed to touch a language model:
`parser` (words → TripIntent) and `prose` (computed facts → copy). Everything else is
deterministic. Enforced mechanically, not by convention (see allowlist guard).

**Deterministic core / the engine** — `src/lib/engine`: pure TypeScript with zero
framework and zero LLM dependencies. All search, filtering, ranking, pricing, and
diff logic. Testable without mocks, and runs identically on server and in the browser
(which is what makes client-side live re-ranking cheap).

**Allowlist guard / import boundaries** — The Vitest test
([import-boundaries.test.ts](src/lib/import-boundaries.test.ts)) that makes the
architecture checkable: engine may import only zod/schema/engine; `ai` and
`@openrouter/*` may appear only under `parser/` and `prose/`. An allowlist, not a
denylist — new dependencies are guilty until proven innocent.

**`IntentParser`** — The interface `(currentIntent, utterance) => Promise<TripIntent>`.
The whole memory model of the product in one signature. Implementation is swappable
config (model/provider via env).

**ParserContext** — The pinned, explicit inputs that make parsing reproducible:
`today` (so "in feb" resolves deterministically) and `supportedPlaces`. Notably does
*not* include the default origin — the parser never uses it; that's engine config.

**Identity policy (hostile input)** — Hostile or nonsense input ("ignore all previous
instructions…") degrades to identity: re-emit `currentIntent` unchanged, empty diff,
no state damage. Pinned by fixtures — including ones whose requested mutations are
schema-*valid*, so Zod rejection can't mask a policy failure.

**Number-provenance guard** — The check on prose output: every digit sequence and
spelled-out number word in the copy must correspond to a value in the input facts,
else a deterministic fallback template renders. Enforces *provenance* (no number can
originate from the LLM), not claim-binding — that distinction is deliberate and
documented.

**ExplanationFacts** — The engine-computed, within-result-set comparisons ("fastest
under your arrive-by constraint", "lands 6 hours earlier than the cheapest") that
feed "why this result". If the engine didn't compute it, the explanation can't say it.

**Response healing** — The OpenRouter provider plugin that repairs malformed JSON
from the model before Zod validation. The Zod gate remains the hard boundary; healing
just reduces retries.

**`Output.object` / strict JSON schema mode** — The AI SDK v6 way to get structured
output from `generateText`/`streamText` (the deprecated `generateObject` is banned
here). Strict mode is why the schema uses `.nullable()` and never `.optional()`:
every field must be present, absence is an explicit `null`.

## Schema semantics

**Tri-state constraint** — Every constraint distinguishes `null` (never stated) from
a value (stated) from, for booleans, `false` (explicitly waived: "red-eyes are
fine"). This is what makes constraint *removal* representable.

**`nonstop: 'required' | 'preferred'`** — Two strengths on purpose: "nonstop" filters
(required), "nonstop if possible" only boosts ranking (preferred). Deliberately not a
boolean.

**`arriveBy` / `departAfter`** — Daytime clock-time deadlines ("land by 5pm",
"nothing before 9am"), local at destination/origin respectively, compared as
time-of-day.

**`avoidLateArrival`** — The "nothing that lands after midnight" flag: arrival in the
engine-defined small-hours window (00:00–05:00 local). Exists because clock-time
comparison can't express crossing midnight — a 00:30 arrival compares as *earlier*
than any evening deadline.

**`avoidRedeye`** — The departure-side twin: don't take off in the late-night window.
What counts as a red-eye is an engine definition, not a schema one.

**Date window + flexibility** — Dates are always a window (`earliest`/`latest`) plus
`exact` (a named day, endpoints equal) or `flexible` ("in february" — any day in the
window works). The window carries the semantics; flexibility is mostly display.

**Travelers = occupied seats** — What availability must find and pricing must
multiply. 1–9. Passenger-type modeling (lap infants etc.) is explicitly out of scope.

## Search and results

**Simulated availability** — The one fabricated layer: flight inventory from a seeded
generator behind the `AvailabilityProvider` interface, with realistic shape (scarce
premium cabins, variable pricing). Fake data, **real** streaming transport and
timing. Labeled fake per the PRD — everything downstream of it is real.

**Latency profile** — The per-source response delays we choose for the simulation.
Tuned so the first batch lands ≤600ms, which is what makes the PRD's
under-3-seconds-to-first-result budget honest.

**Batch** — One source's chunk of results arriving on the stream. Each batch flows
through engine filter + rank incrementally; the best-match badge re-computes per
batch ("live re-ranking").

**Award-style pricing** — Results priced as "62,500 miles + $48" with fictional
program names: keeps the points-travel flavor without asserting any real-world
transfer ratios or valuations (which are exactly what the PRD pushed to phase 2).

## Testing and data

**Parser fixtures** — The committed test set in
[fixtures.ts](src/lib/parser/fixtures.ts): each is (context, currentIntent,
utterance) → expected **full** TripIntent + `expectedChangedFields`. Deep equality on
the whole intent asserts preservation structurally; the diff assertion proves exactly
the right chips move. Fixture categories: initial, assumption, refinement, removal,
hostile.

**Self-consistency tests** — The no-network suite
([fixtures.test.ts](src/lib/parser/fixtures.test.ts)) validating the fixture *data*
itself: intents pass the schema gate, expected values are already canonical, diffs
match the declared changed-field sets.

**Live-model eval** — Running the fixture suite against the real model over the real
parser (M1 work). Same assertions as the self-consistency suite, but exercising the
LLM. The fixture data is model-independent; the eval is where model choice gets
graded.

**Pinned context (`today`)** — Fixtures never depend on the wall clock; every fixture
carries the reference date its relative-date expectations were written against
("feb" → *next* February relative to `today`).
