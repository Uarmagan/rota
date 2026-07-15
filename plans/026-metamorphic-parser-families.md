# Plan 026: Add metamorphic parser fixture families

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update only this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 008d4db -- src/lib/parser/fixtures.ts src/lib/parser/fixtures.test.ts scripts/eval-policy.ts scripts/eval-policy.test.ts scripts/eval.ts ARCHITECTURE.md`
> Drift from plans 023 and 025 is expected. Confirm those plans are complete and
> use their resulting contracts as the baseline. Any other semantic drift is a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/023-strict-unhandled-grading.md`, `plans/025-parser-airport-aliases.md`
- **Category**: direction
- **Planned at**: commit `008d4db`, 2026-07-14

## Why this matters

The challenge tier contains strong individual utterances, but each requirement
is represented by one wording. A model can pass those strings while remaining
brittle to punctuation, clause order, fillers, appositives, or a minimal change
that flips whether a named person is traveling. Metamorphic families test that
equivalent language yields the same chips and that minimally different language
yields the intended different state, without adding an LLM judge.

## Current state

- `src/lib/parser/fixtures.ts` contains 38 full fixtures, including 10 strict
  challenge fixtures.
- Every fixture repeats a complete `currentIntent`, utterance, expected intent,
  expected `unhandled`, and exact changed-field list.
- `scripts/eval.ts` iterates `parserFixtures` directly and reports one scorecard
  row per fixture name.
- `src/lib/parser/fixtures.test.ts` checks schema validity, canonical state,
  exact diffs, and gap behavior for each fixture.
- The architecture intentionally keeps deterministic fixtures canonical and the
  live runner separate from Vitest. Preserve that layering.
- Prompt examples must remain disjoint from strict challenge utterances.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Fixture tests | `pnpm exec vitest run src/lib/parser/fixtures.test.ts` | all pass |
| Eval policy tests | `pnpm exec vitest run scripts/eval-policy.test.ts` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Full suite | `pnpm test` | all tests pass |
| Challenge eval | `pnpm eval -- --challenge` | every expanded case passes 5/5 |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `src/lib/parser/fixtures.ts`
- `src/lib/parser/fixtures.test.ts`
- `scripts/eval-policy.ts`
- `scripts/eval-policy.test.ts`
- `scripts/eval.ts`
- `ARCHITECTURE.md`
- `ROADMAP.md` only for fixture/case counts; do not change milestone status here
- Administrative exception: update only plan 026's row in `plans/README.md`

**Out of scope**:

- Changing `TripIntent` or parser output schemas
- Adding an LLM judge, random production fuzzing, or hosted eval service
- Generating live test utterances dynamically; the canonical corpus stays committed
- Weakening 5/5 strict challenge requirements
- Editing parser prompt policy merely to mirror test strings

## Git workflow

- Branch: `advisor/026-metamorphic-parser-families`
- Use one or two focused commits: harness representation, then curated families.
- Example subject: `Add metamorphic parser challenge families`.
- Do not push or open a PR unless explicitly requested.

## Steps

### Step 1: Introduce an explicit family representation

Add a small typed representation that lets one canonical fixture declare
curated utterance variants without duplicating the complete expected intent.
Acceptable shape:

```ts
interface ParserUtteranceVariant {
  name: string
  utterance: string
}
```

A fixture may own a readonly variant list; existing fixtures without variants
must remain valid. Export a deterministic expansion helper that produces unique
case names and full evaluation cases. Do not mutate fixture objects at runtime.

The original fixture name remains the canonical case. Expanded names should be
stable and filterable, for example `named-travelers-telegraphic::no-punctuation`.

**Verify**: add offline tests for unique expanded names, stable order, and exact
inheritance of context/current/expected/unhandled/changed fields.

### Step 2: Route offline and live runners through expanded cases

Update `fixtures.test.ts`, `eval-policy.ts`, and `eval.ts` so both offline
self-consistency and live evaluation see the same expanded case list.

Required CLI behavior:

- `--challenge` includes variants of challenge fixtures;
- `--fixture <canonical-name>` selects the canonical case and its variants;
- `--fixture <expanded-name>` selects exactly that expanded case;
- every challenge variant requires at least five reps and 100% correctness;
- scorecard rows use stable expanded names.

Add tests for selection and count behavior. Avoid hardcoding only the old total
of ten challenge cases.

**Verify**: `pnpm exec vitest run scripts/eval-policy.test.ts src/lib/parser/fixtures.test.ts`
→ all pass.

### Step 3: Add curated semantic-equivalence families

Add at least two variants for each of these existing challenge themes:

- three named travelers: punctuation removal and reordered/clause-fragment form;
- place-like person names: alternate list punctuation and destination placement;
- quantified family: appositive wording such as a relationship plus a name,
  ensuring one person is counted once;
- self-correction: exclusion expressed with a different correction marker;
- noisy shorthand: reordered tokens and harmless filler;
- dense refinement: named traveler joins while unsupported seat preference remains.

Every variant must have genuinely equivalent semantics. Keep names, dates, and
places varied enough that the model cannot succeed by memorizing one token order.

**Verify**: offline fixture expansion tests pass and every expanded case preserves
the base fixture's expected state exactly.

### Step 4: Add minimal-pair negative fixtures

Add standalone full fixtures where a tiny wording change intentionally changes
the expected state. Include at least:

- `my wife Maya` counts one companion, not both a relationship and a second name;
- `Maya recommended... for me and Lee` excludes the recommender;
- `meet Maya in Tokyo` does not count Maya as a traveler;
- `Paris and Austin suggested London` does not turn person/place tokens into
  origin or traveler chips without travel grammar;
- an unquantified `family` or `team` preserves travelers as null or current state.

These are not variants because their expected state differs. Give each a full
explicit expected intent and changed-field set.

**Verify**: `pnpm exec vitest run src/lib/parser/fixtures.test.ts` → all pass.

### Step 5: Update counts and testing documentation

Update `ARCHITECTURE.md` and only the corpus-count lines in `ROADMAP.md` to
distinguish canonical fixtures from expanded eval cases. Avoid a misleading
single number if one fixture can produce several cases.

Add a small deterministic command or test assertion that reports both counts so
future documentation updates do not rely on manual counting.

**Verify**: the documented counts equal values produced by the expansion helper.

### Step 6: Run the strict live matrix

Run focused tests, typecheck, and the full suite. Then run the complete challenge
matrix at five reps. Review failures by family; fix general policy/context only
when the failure demonstrates a real semantic gap. Do not copy variant wording
into prompt examples.

**Verify**:

- `pnpm typecheck` → exit 0
- `pnpm test` → all tests pass
- `pnpm eval -- --challenge` → every expanded challenge case passes 5/5
- `git diff --check` → no output

## Test plan

- Expansion helper: unique names, stable order, inheritance, canonical-name and
  expanded-name filtering.
- Metamorphic positives: same complete intent and exact changed-field set.
- Minimal-pair negatives: deliberately different complete intent.
- CLI: challenge repetition floor and 100% threshold apply to every variant.
- Live run: report failures grouped by stable family prefix.

## Done criteria

- [ ] Canonical fixtures can declare committed, deterministic utterance variants.
- [ ] Offline and live runners consume the same expanded cases.
- [ ] At least six positive families have two variants each.
- [ ] At least five minimal-pair negative fixtures cover role/count ambiguity.
- [ ] Challenge variants retain the five-rep, 100% gate.
- [ ] Prompt examples remain disjoint from challenge utterances.
- [ ] Documentation distinguishes fixture and case counts accurately.
- [ ] `pnpm typecheck`, `pnpm test`, and live challenge eval pass.
- [ ] `git diff --check` returns no output.
- [ ] Plan 026's status row is updated in `plans/README.md`.

## STOP conditions

Stop and report if:

- Plans 023 or 025 are incomplete.
- A proposed variant is not semantically equivalent to its base fixture.
- Supporting variants requires changing the parser output schema.
- Live failures can only be hidden by lowering the 100% threshold or copying
  fixture strings into the prompt.
- The API key is unavailable; report offline completion and the pending live matrix.
- Any verification fails twice after a reasonable correction.

## Maintenance notes

- Prefer a few high-information variants over combinatorial string generation.
- New parser policies should normally add one positive family and one minimal-pair
  negative case.
