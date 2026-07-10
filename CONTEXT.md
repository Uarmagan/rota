# Rota

Conversational flight search on simulated availability: natural language in, visible
structure out. Single context — this glossary is the ubiquitous language for the whole
product.

## Language

### Intent and conversation

**TripIntent**:
The complete structured description of the trip the user wants — travelers, origin,
destination, cabin, dates, constraints — with every unstated field null. The single
source of truth: chips render it, searches run from it, conversation edits it.
_Avoid_: query, search params, request, session state

**Utterance**:
One user message, always parsed against the current TripIntent. There is no chat
history anywhere in the system.
_Avoid_: prompt, chat message

**Chip**:
The editable UI rendering of one TripIntent field. Tapping a chip edits the intent
directly, no parser involved.
_Avoid_: pill, tag, badge, filter

**Full-state re-emission**:
The parser contract: re-emit the COMPLETE TripIntent with every unmentioned field
preserved. Never a patch.
_Avoid_: patch, delta, merge, partial update

**Refinement**:
A user utterance that edits existing intent ("actually business class").
_Avoid_: follow-up (that word is reserved for the system's question)

**Removal**:
A refinement that returns a field to null ("forget the nonstop thing").

**IntentDiff**:
The chip-level list of changes between two intents; each entry is set, changed, or
cleared. Computed by the engine, never emitted by a model; drives chip animation and
nothing else.
_Avoid_: patch, changeset

**Intent pipeline**:
The fixed sequence every utterance runs: parse → canonicalize → fill assumptions →
diff → gaps → search. Initial search is the empty-current-intent case of the same path.

**Normalization**:
Canonicalization plus assumption-filling. Diff, gap policy, and search only ever see
normalized intents.

### Ambiguity

**Gap**:
A hole in a parsed intent — a null field, or a contradiction between constraints.

**Assumption**:
A low-risk gap filled with a labeled, one-tap-editable default ("From: Chicago
(assumed)"). Only the engine may create one.
_Avoid_: silent default, guess

**Targeted follow-up**:
The single deterministic question a high-risk gap earns (missing destination,
contradictory constraints). Never a wall of questions.
_Avoid_: clarification flow, wizard

**Identity (hostile input)**:
The required outcome for hostile or nonsense utterances: the current intent is
re-emitted unchanged — empty diff, no state damage.

### Places and dates

**Place**:
An airport the simulation knows: IATA code plus canonical city label.
_Avoid_: location, destination (as a type name)

**Place registry**:
The closed, versioned list of supported places. Registry order is policy: the first
entry for a city is what a bare city name resolves to.
_Avoid_: airport database, city list

**Canonicalization**:
Mapping every parser-emitted IATA code to its registry entry, discarding the model's
own city label. Unknown codes reject the parse.

**Date window**:
How dates are always held: earliest + latest + flexibility, where exact means a named
day and flexible means any day in the window works.

### Constraints

**Tri-state constraint**:
Every constraint distinguishes null (never stated), a value (stated), and — for
booleans — false (explicitly waived: "red-eyes are fine"). This is what makes removal
representable.

**Nonstop, required vs preferred**:
Required filters results out; preferred only boosts ranking ("nonstop if possible").
Deliberately not a boolean.

**Arrive-by / depart-after**:
Daytime clock-time deadlines, local at destination and origin respectively, compared
as time-of-day.

**Late arrival**:
Arrival in the small-hours window (00:00–05:00 local) — what "nothing that lands
after midnight" means. Not expressible as an arrive-by deadline, hence its own flag.

**Red-eye**:
Departure in the late-night window. The exact window is an engine definition, not a
schema one.

**Traveler**:
An occupied seat — what availability must find and pricing must multiply. Lap infants
and passenger types are out of scope.
_Avoid_: passenger, pax, guest

### Results

**Simulated availability**:
The one fabricated layer — flight inventory from a seeded generator behind the
`AvailabilityProvider` interface. Fake data, real streaming transport and timing;
everything downstream of it is real.
_Avoid_: mock data, test inventory

**Source**:
One simulated availability provider, with its own latency profile and inventory shape.
_Avoid_: airline, supplier

**Batch**:
One source's chunk of results arriving on the stream. Each batch re-runs filter and
rank incrementally.

**Latency profile**:
The per-source response delays chosen for the simulation — fake data, honest timing.

**Best match**:
The top-ranked result under the current intent; its badge visibly and legibly moves
as batches land.
_Avoid_: recommendation, top pick

**Award pricing**:
Miles-plus-fees display with fictional program names: award-travel flavor without
asserting any real-world points facts.

**Why-this-result**:
The one-or-two-line explanation on a top result, phrased strictly from
ExplanationFacts. If the engine didn't compute it, the line can't say it.

### Boundaries

**Engine**:
The deterministic core: all search, filter, rank, pricing, diff, and gap logic. If a
number is on screen, the engine computed it.
_Avoid_: backend, business logic layer

**LLM boundary**:
The only two seams where a language model exists: parser (words → TripIntent) and
prose (facts → copy).
_Avoid_: "the AI" for anything outside these two

**Allowlist guard**:
The test that makes the LLM boundary checkable: engine may import only zod/schema/engine,
and `ai`/`@openrouter/*` may appear only under parser and prose. An allowlist — new
dependencies are guilty until proven innocent.
_Avoid_: import lint, boundary check

**Parser**:
The boundary that turns an utterance plus current intent into a complete TripIntent.
It interprets; it never computes and never decides what to ask.

**Prose**:
The boundary that turns ExplanationFacts into short copy. It phrases facts; it cannot
create them.

**ExplanationFacts**:
Engine-computed comparisons within a result set ("fastest under your arrive-by
constraint") — the only raw material prose may use.

**Number-provenance guard**:
The check that every digit and number word in prose corresponds to a value in the
facts, else a deterministic template renders instead. Enforces provenance, not
claim-binding.

**Response healing**:
The provider plugin that repairs malformed model JSON before Zod validation. The Zod
gate stays the hard boundary; healing only reduces retries.

### Testing language

**Parser fixture**:
One committed case: pinned context + current intent + utterance → expected full
TripIntent and the exact set of changed fields. The fixture set is a product
requirement, not test convenience.

**Pinned context**:
The frozen inputs a fixture was written against — reference date and place-registry
snapshot — so expectations never depend on the wall clock.

**Self-consistency tests**:
The no-network suite that validates the fixture data itself — intents pass the schema
gate, expected values are already canonical, and declared changed-field sets match the
computed diff. Distinct from the live-model eval, which exercises the model.

**Live-model eval**:
Running the fixture suite through the real parser against the real model. Where a
model choice gets graded.
