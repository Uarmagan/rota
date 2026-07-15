# Plan 025: Make airport names first-class parser context

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update only this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 008d4db -- src/lib/schema/places.ts src/lib/parser/intent-parser.ts src/lib/parser/prompt.ts src/lib/parser/fixtures.ts src/lib/parser/fixtures.test.ts src/lib/parser/openai-intent-parser.test.ts src/app/api/deps.ts src/lib/import-boundaries.test.ts ARCHITECTURE.md`
> At planning time these paths had no uncommitted changes. Any semantic drift is
> a STOP condition unless it is exactly plan 023 already landed.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/023-strict-unhandled-grading.md`
- **Category**: direction
- **Planned at**: commit `008d4db`, 2026-07-14

## Why this matters

The parser prompt promises that a specific airport name resolves to that airport,
but its context supplies only `IATA: city` pairs. Names such as Haneda, Heathrow,
Gatwick, Orly, and Midway therefore depend on the model's world knowledge rather
than Rota's versioned registry. Supplying explicit aliases makes secondary-airport
translation deterministic, testable, and portable across future model changes.

## Current state

- `src/lib/parser/prompt.ts:5-7` renders supported places as:

  ```ts
  context.supportedPlaces.map((place) => `${place.iata}: ${place.city}`)
  ```

- The same prompt says: `a specific airport name or code means that airport`.
- `src/lib/parser/intent-parser.ts` defines `ParserContext` with only `today`
  and `supportedPlaces`.
- `src/lib/availability/airports.ts` contains canonical airport display names,
  but parser code may not import availability code. The import-boundary test
  enforces parser → schema/parser/LLM only.
- `src/lib/schema/places.ts` owns the versioned supported-place vocabulary and
  is the appropriate shared boundary for parser-visible aliases.
- `Place` and `TripIntent` are frozen. Do not add aliases or airport names to
  either wire shape.
- Existing live coverage exercises Newark and LaGuardia only; Newark is already
  the city label, while LaGuardia currently relies on model knowledge.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Parser tests | `pnpm exec vitest run src/lib/parser/fixtures.test.ts src/lib/parser/openai-intent-parser.test.ts` | all pass |
| Boundary tests | `pnpm exec vitest run src/lib/import-boundaries.test.ts` | all pass |
| Eval policy | `pnpm exec vitest run scripts/eval-policy.test.ts` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Full suite | `pnpm test` | all tests pass |
| Live challenge | `pnpm eval -- --challenge` | every challenge case passes 5/5 |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `src/lib/schema/places.ts`
- `src/lib/parser/intent-parser.ts`
- `src/lib/parser/prompt.ts`
- `src/lib/parser/fixtures.ts`
- `src/lib/parser/fixtures.test.ts`
- `src/lib/parser/openai-intent-parser.test.ts`
- `src/app/api/deps.ts`
- `src/lib/import-boundaries.test.ts` only if a new schema import needs explicit coverage
- `ARCHITECTURE.md`
- Administrative exception: update only plan 025's row in `plans/README.md`

**Out of scope**:

- Changing `Place`, `TripIntent`, `ParseResult`, or API response shapes
- Importing `src/lib/availability` from parser or schema modules
- Metro codes, real inventory, booking links, or fuzzy destination search
- Adding aliases for unsupported airports
- Rewriting parser retry or canonicalization behavior

## Git workflow

- Branch: `advisor/025-parser-airport-aliases`
- Use focused commits if desired: registry/context first, fixtures/docs second.
- Imperative subjects, for example `Ground airport names in parser context`.
- Do not push or open a PR unless explicitly requested.

## Steps

### Step 1: Add versioned aliases beside the place registry

In `src/lib/schema/places.ts`, add a typed, immutable alias table keyed by the
existing supported IATA codes. Keep `SUPPORTED_PLACES` and `Place` unchanged.

Alias requirements:

- include common airport names and compact spoken forms, not every marketing
  suffix;
- cover at least the ambiguous metro members: JFK/LGA, ORD/MDW, LHR/LGW/STN,
  CDG/ORY, NRT/HND, SFO/OAK;
- include examples such as `LaGuardia`, `Midway`, `Heathrow`, `Gatwick`, `Orly`,
  `Narita`, `Haneda`, and `Oakland`;
- keys must exactly match supported IATA codes and alias strings must be unique
  enough not to resolve two airports in the same context.

Add a pure helper that returns aliases only for a supplied supported-place list,
so the legacy seven-place fixture context cannot accidentally learn aliases for
newer places.

**Verify**: add or extend offline tests so unknown keys, duplicate ambiguous
aliases, and aliases for places outside a supplied context are rejected.

### Step 2: Extend parser context without changing wire schemas

Add an explicit required alias field to `ParserContext` and
`ParserFixtureContext`. Use a concrete readonly type; do not use `any` or an
optional property. Update `createParser`, the live fixture context, legacy
fixture context, and parser adapter tests.

The membership gate must continue checking IATA codes from `supportedPlaces`.
Aliases are prompt vocabulary, not a second acceptance registry.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Render aliases in the supported-place prompt

Update `buildSystemPrompt` so each place line includes only that place's aliases,
for example:

```text
HND: Tokyo (airport names: Haneda, Tokyo Haneda)
```

Keep registry order intact because bare-city resolution depends on it. Add
prompt tests proving:

- bare `Tokyo` still resolves by list order to NRT;
- HND lists Haneda but not Narita aliases;
- a legacy context does not list airports outside that context;
- prompt examples remain disjoint from strict challenge utterances.

**Verify**: `pnpm exec vitest run src/lib/parser/openai-intent-parser.test.ts`
→ all pass. If prompt formatting lacks a focused test seam, add assertions in
the nearest existing parser test rather than creating a snapshot.

### Step 4: Add strict named-airport fixtures

Add challenge fixtures for at least:

- `Haneda` vs bare `Tokyo`;
- `Gatwick` or `Stansted` vs bare `London`;
- `Midway` vs bare `Chicago`;
- one named-airport refinement against dense current intent, proving all
  unrelated fields are preserved.

Each case must assert the complete expected intent, exact changed-field set,
and null `unhandled`. Keep utterances disjoint from prompt examples.

**Verify**: `pnpm exec vitest run src/lib/parser/fixtures.test.ts scripts/eval-policy.test.ts`
→ all pass.

### Step 5: Document the parser-visible alias boundary

Update `ARCHITECTURE.md` to state that parser context carries versioned place
aliases from schema vocabulary while availability retains geometry and display
metadata. Record explicitly that `Place` and the API wire shape remain frozen.

**Verify**: `rg -n "alias|airport name" ARCHITECTURE.md src/lib/parser/prompt.ts src/lib/schema/places.ts`
must show the same ownership model in docs and code.

### Step 6: Run offline and live promotion gates

Run focused tests, boundary tests, typecheck, and the full suite. Then run the
strict challenge eval with an API key. Do not weaken alias fixtures if the model
fails; use failure output to adjust only explicit alias context or prompt wording.

**Verify**:

- `pnpm typecheck` → exit 0
- `pnpm test` → all tests pass
- `pnpm eval -- --challenge` → every challenge fixture passes 5/5
- `git diff --check` → no output

## Test plan

- Registry tests: alias keys belong to `SUPPORTED_PLACES`; ambiguous aliases do
  not map to multiple IATA codes.
- Prompt tests: aliases are context-filtered and registry order is preserved.
- Fixtures: initial and refinement cases across at least three multi-airport metros.
- Existing canonicalization and membership tests remain unchanged and green.

## Done criteria

- [ ] Named-airport aliases are explicit, versioned parser context.
- [ ] `Place`, `TripIntent`, and API wire shapes are unchanged.
- [ ] Parser imports no availability module.
- [ ] At least four strict alias cases cover initial and refinement parsing.
- [ ] Boundary tests, typecheck, and full offline suite pass.
- [ ] Live challenge suite passes every case 5/5, or missing credentials are
      reported as a STOP without weakening cases.
- [ ] `git diff --check` returns no output.
- [ ] No files outside scope are modified.
- [ ] Plan 025's status row is updated in `plans/README.md`.

## STOP conditions

Stop and report if:

- The implementation appears to require changing `Place` or `TripIntent`.
- Parser code would need to import availability code.
- Two supported airports require the same alias and grammar/context cannot
  disambiguate them deterministically.
- Plan 023 has not landed and challenge `unhandled` grading is still containment-based.
- The live API key is unavailable; report offline completion and the pending gate.
- Any verification fails twice after a reasonable correction.

## Maintenance notes

- Airport aliases are parser vocabulary; coordinates, offsets, hub flags, and
  display details remain availability data.
- Bump the place vocabulary version whenever alias semantics change, even if the
  `SUPPORTED_PLACES` rows do not.
