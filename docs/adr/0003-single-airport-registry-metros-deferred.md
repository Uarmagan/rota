# One airport per city for MVP; multi-airport metros deferred to phase 2

Status: superseded in part by ADR 0008. M6 exercises the registry-order escape hatch
without adding metro codes; the production metro abstraction remains deferred.

The place registry had two Tokyo airports (NRT, HND) and a documented "first entry wins"
rule for bare city names. That rule was only ever enforced by a soft parser-prompt
instruction — `canonicalizePlaces` validates whatever IATA code the model emits and does
not re-resolve to the first entry — so which airport "Tokyo" resolved to was effectively
a language-model choice.

## Decision

Keep the registry **one airport per city** for MVP, and drop HND so every city resolves
unambiguously. Bare-city resolution then can't wobble and depends on no prompt behavior.
Defer **multi-airport metros** — a metro code like `TYO` that the engine expands to
`{NRT, HND}` at search time — to phase 2.

## Why

- **It was one city.** Only Tokyo had two airports (even New York is modeled with just
  JFK). Building the metro abstraction — a place that is a metro vs an airport, expansion
  to member airports at search, narrowing refinements ("actually just Haneda":
  `TYO` → `HND`), and ranking across a mixed-airport result set — to serve a single city
  in a demo is a poor scope trade. Metros are correct for a production engine, which is
  why the product scope parks them in phase 2.
- **The demo doesn't need it.** No 60-second demo-path utterance depends on multi-airport
  coverage.
- **Self-enforcing beats soft-enforced.** With no ambiguous city, "first entry wins"
  needs no prompt instruction and cannot drift between runs.

## Considered and rejected

- **Keep both Tokyo airports, resolve deterministically in the engine.** Rejected: the
  parser emits a bare IATA code, so by the time the engine sees it, "Tokyo" (bare) and
  "Haneda" (explicit) are indistinguishable. Deterministic bare-city resolution would
  require the parser to emit city-vs-airport separately — a schema change MVP doesn't
  want.
- **Keep both, accept the soft LLM resolution.** Rejected: leaves a consistency wobble on
  a field the registry can make deterministic for free by dropping the ambiguity.
- **Build metro codes now.** Rejected as disproportionate; deferred to phase 2.

## Reversal path

Phase 2 re-adds HND (and other airports) alongside the metro concept. Nothing here is
hard to undo — it's a registry entry and a version bump.
