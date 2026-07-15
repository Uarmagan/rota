# Plan 023: Make challenge `unhandled` grading reject extra model-authored text

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update only this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 008d4db -- scripts/eval-policy.ts scripts/eval-policy.test.ts src/lib/parser/fixtures.ts ARCHITECTURE.md`
> At planning time these paths had no uncommitted changes. If the command is
> non-empty, compare the live code with the excerpts below; any semantic
> mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `008d4db`, 2026-07-14

## Why this matters

The strict challenge tier currently accepts any `unhandled` value containing
the expected words as a contiguous subsequence. That lets a response such as
`aisle seat plus a fabricated limousine request` pass the `aisle seat` fixture,
even though `unhandled` is an echo-only boundary and may not invent extra facts.
The challenge score must reject both missing words and extra model-authored
content if it is going to be a credible promotion gate.

## Current state

- `scripts/eval-policy.ts:49-56` implements the correctness check:

  ```ts
  if ((actual === null) !== (expected === null)) return false
  if (!fixture.challenge || expected === null) return true
  return actual !== null && containsExpectedPhrase(actual, expected)
  ```

- `scripts/eval-policy.ts:97-113` normalizes strings into tokens, then searches
  for the expected token sequence anywhere in the actual output.
- `scripts/eval-policy.test.ts:49-57` checks missing words, but has no assertion
  rejecting extra prefix or suffix text.
- `src/lib/parser/fixtures.ts` documents challenge output as requiring the
  complete expected clause.
- `ARCHITECTURE.md` describes the challenge tier as hard-grading normalized
  `unhandled` output.
- ADR `docs/adr/0002-unhandled-clauses-and-the-number-provenance-carve-out.md`
  is binding: `unhandled` may readably format the user's clause, but it must not
  introduce new specifics.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm exec vitest run scripts/eval-policy.test.ts src/lib/parser/fixtures.test.ts` | all pass |
| Typecheck | `pnpm typecheck` | exit 0, no errors |
| Full offline suite | `pnpm test` | all tests pass |
| Live challenge gate | `pnpm eval -- --challenge` | every selected fixture passes 5/5 |
| Diff hygiene | `git diff --check` | no output |

The live command is networked and spends model tokens. Do not run it without an
available `OPENAI_API_KEY`; see the STOP conditions.

## Scope

**In scope**:

- `scripts/eval-policy.ts`
- `scripts/eval-policy.test.ts`
- `src/lib/parser/fixtures.ts` — comments only
- `ARCHITECTURE.md` — challenge-grading wording only
- Administrative exception: update only plan 023's row in `plans/README.md`

**Out of scope**:

- Changing any fixture's expected intent, changed fields, utterance, or
  `expectedUnhandled` value
- Changing the parser prompt or parser implementation
- Tightening ordinary, non-challenge wording beyond its existing nullness gate
- Adding an LLM judge or hosted evaluation service

## Git workflow

- Branch: `advisor/023-strict-unhandled-grading`
- Use one focused commit with an imperative subject, for example
  `Tighten challenge unhandled grading`.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Pin the false-positive behavior with tests

In `scripts/eval-policy.test.ts`, extend the challenge wording test to require:

- case and punctuation differences still match after normalization;
- the exact normalized phrase matches;
- a missing token fails;
- an extra prefix fails;
- an extra suffix fails;
- an extra unsupported clause containing a new number fails.

Keep the ordinary-fixture diagnostic test unchanged.

**Verify**: `pnpm exec vitest run scripts/eval-policy.test.ts` must fail only on
the new extra-text assertions before the implementation changes.

### Step 2: Replace subsequence acceptance with normalized equality

In `scripts/eval-policy.ts`, make strict challenge correctness compare the full
normalized token arrays for equality. Keep the existing contains-style helper
for `wordingHit`, which is diagnostic-only. Use distinct helper names so a
future refactor cannot accidentally route correctness back through the soft
diagnostic.

Do not require byte-for-byte punctuation or casing. Do require the same complete
normalized phrase with no extra tokens.

**Verify**: `pnpm exec vitest run scripts/eval-policy.test.ts` → all tests pass.

### Step 3: Align the fixture and architecture documentation

Update the challenge comments in `src/lib/parser/fixtures.ts` and the testing
strategy in `ARCHITECTURE.md` to say that non-null challenge `unhandled` output
must equal the expected phrase after Unicode, case, and punctuation
normalization. Do not change fixture data or historical eval results.

**Verify**: `rg -n "contain the complete|contains the complete" ARCHITECTURE.md src/lib/parser/fixtures.ts`
must return no stale description of subsequence matching.

### Step 4: Run the offline and live gates

Run the focused tests, typecheck, and full suite. If an API key is available,
run the five-rep challenge suite. A live failure is a product signal; do not
weaken equality to recover a green score.

**Verify**:

- `pnpm typecheck` → exit 0
- `pnpm test` → all tests pass
- `pnpm eval -- --challenge` → every fixture 5/5, when credentials are available
- `git diff --check` → no output

## Test plan

- Extend `scripts/eval-policy.test.ts` using the existing
  `party-join-plus-unhandled` and `qualified-unsupported-place` fixtures.
- Assert accepted formatting variants such as `Paris, Texas` vs `PARIS TEXAS`.
- Assert rejected hallucinated additions before and after the expected phrase.
- Keep `wordingHit` soft and diagnostic-only.

## Done criteria

- [ ] Challenge correctness uses full normalized equality, not containment.
- [ ] Extra prefix, suffix, clause, and numeric text regression tests pass.
- [ ] Ordinary fixture grading is unchanged.
- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm test` passes.
- [ ] Live challenge eval passes 5/5 per fixture, or the missing-credential STOP
      is reported without weakening the evaluator.
- [ ] `git diff --check` returns no output.
- [ ] No files outside the in-scope list are modified.
- [ ] Plan 023's status row is updated in `plans/README.md`.

## STOP conditions

Stop and report if:

- The challenge fixture contract has changed from one expected echo phrase per
  fixture.
- Exact normalized equality requires changing a fixture expectation to make the
  current model pass.
- The live eval cannot run because `OPENAI_API_KEY` is unavailable; report the
  offline completion and leave the live gate explicitly pending.
- Any verification fails twice after a reasonable correction.
- The fix appears to require parser prompt or runtime changes.

## Maintenance notes

- If readable variants become necessary later, add an explicit finite list of
  accepted phrases per fixture. Do not restore arbitrary containment.
- Reviewers should scrutinize the separation between hard correctness and soft
  wording diagnostics.
