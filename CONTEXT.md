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
A risky gap the engine fills AND flags with a one-tap-editable label ("From: Chicago
(assumed)") that says "double-check me". Reserved for genuine guesses about the user —
currently origin only. Confirming flips the flag off. Only the engine creates one.
_Avoid_: silent default, guess

**Default**:
A safe unstated field the engine fills with a near-universal fallback (cabin → economy,
travelers → 1), rendered as a plain, editable chip — visible and correctable, but NOT
flagged "(assumed)". Satisfies principle 1 (nothing is silently decided) without
diluting the assumption signal by stamping it on low-stakes fields. A field is thus in
one of three states: stated, assumed, or defaulted. See docs/adr/0004.
_Avoid_: silent default (it shows a chip), assumption (a default is unflagged)

**Targeted follow-up**:
The single deterministic question a high-risk gap earns (missing destination,
contradictory constraints). Never a wall of questions. Surfaces in the chip row as an
unfilled, prompting chip (resolved inline via the single input or a registry
typeahead), never as a chat bubble or modal — there is no chat surface.
_Avoid_: clarification flow, wizard

**Unhandled**:
A recognized-but-unsupported clause the parser could not map to any field ("exactly one
connection", "window seat") — NOT a parse failure (those take the feedback-retry
path). Hostile or meta-instruction text is also not unhandled: it is dropped silently
and never echoed. Emitted as `unhandled: string | null` *beside* the TripIntent in the
parser's `ParseResult`, never as a field on it: it is transient (fresh per utterance,
never persisted), never a chip, never diffed. Echo-only display text — it quotes the
user's own clause back, introducing no new numbers or facts, which is the one narrow,
sanctioned place model-authored text reaches the screen from the parser boundary.
_Avoid_: dropped, ignored, error, leftover

**Notice (ready-with-notice)**:
The non-blocking gap outcome when the intent is searchable but carried an `unhandled`
clause: the search streams AND the echo line renders. Distinct from a follow-up — it is
not a question, so "never a wall of questions" still holds. Missing destination is a hard
blocker and is adjudicated first; when destination is ALSO missing, the follow-up absorbs
the echo (see [[Destination theme]]) rather than deferring it invisibly.
_Avoid_: warning, follow-up (it asks nothing)

**Destination theme**:
A deliberately vague destination ("somewhere warm", "a beach") — an invitation to
explore, not an omission. MVP does no theme→destination search (the registry has no warm
places anyway; phase 2 owns exploratory search). The theme is captured as [[Unhandled]]
and, since it leaves destination null, absorbed into the missing-destination follow-up so
the user's intent is acknowledged, never silently treated as a blank field. See
docs/adr/0005.
_Avoid_: missing destination (a theme is stated, not absent), exploratory search

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

### Ranking

**Priority**:
A ranking preference — `cheapest`, `fastest`, or null. Reweights the scoring blend
toward price or duration; it never filters, so no result ever drops. Two-state (null or
a value, no coherent `false`), which is why it lives top-level and not among the
tri-state constraints. A single axis, so "cheap and fast" is not representable and the
two values can never contradict.
_Avoid_: sort, sort order, filter, preference (bare)

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
LLM packages may appear only under parser and prose, and parser never imports engine.
An allowlist — new dependencies are guilty until proven innocent.
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

> **Defend this invariant.** "No number a user sees originates from the model" is the
> load-bearing promise of the whole architecture — it's what separates Rota from a
> chatbot with a form stapled on. It degrades quietly: the first feature that lets the
> model phrase an unverified figure ("about 40% cheaper", "usually 2 stops") reads as
> harmless copy but collapses the guarantee for everything. Any new number in
> user-facing output must trace to an engine-computed fact; if the engine didn't
> compute it, the prose can't say it — add the computation to the engine, don't relax
> the guard. Mirrors the CLAUDE.md invariant; keep them in lockstep.
>
> **One sanctioned exception: [[Unhandled]] echo text.** `unhandled` may put a number
> on screen ("couldn't apply: exactly 1 connection") — but its provenance is the USER,
> not the model: it echoes the user's own clause verbatim. That is a mirror, not a
> claim, so the spirit of the guard holds (the model never *originates* a fact-number).
> This is a carve-out, not a precedent: it does NOT license the model to phrase any
> figure it wasn't handed by the user. Do not widen it.

**Feedback retry**:
The single re-ask with validation errors appended when model output fails the Zod gate
or registry membership. The Zod gate stays the hard boundary.

**Parse failure**:
Invalid output after the feedback retry, surfaced as a typed error and eventually a
visible rephrase prompt. Distinct from [[Unhandled]] and hostile [[Identity (hostile
input)]]; a parse failure is never silent.

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
