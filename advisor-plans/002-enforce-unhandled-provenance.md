# Plan 002: Enforce deterministic provenance for parser `unhandled` echoes

> **Executor instructions**: Follow every step and verification gate. Stop and report
> on a STOP condition; do not improvise. Update the status row in
> `advisor-plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 32d5f8f..HEAD -- src/lib/parser scripts/eval.ts src/lib/import-boundaries.test.ts
> shasum -a 256 src/lib/parser/openai-intent-parser.ts scripts/eval.ts
> ```
>
> Expected baseline: `53769bd4...` for `openai-intent-parser.ts` and
> `aa2dbcc7...` for `scripts/eval.ts`; full hashes are recorded in
> `advisor-plans/README.md`. STOP on semantic drift.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `32d5f8f`, 2026-07-13
- **Execution status**: BLOCKED after two review rounds. The attempted ordered-subsequence
  validator still allowed meaning-changing omission and token reassociation. A future
  executor must implement the contiguous clause-span contract below from a clean branch.

## Why this matters

`unhandled` is the one sanctioned parser-text path to the UI. ADR 0002 permits it only
as an echo of user words, but runtime code accepts any schema-valid model string and the
live eval hard-checks only nullness. A hallucinated unsupported clause or number can
therefore violate Rota's load-bearing promise that the model never originates a number
the user sees.

## Current state

- `src/lib/parser/openai-intent-parser.ts:84-88` returns `unhandled` after trimming only.
- `scripts/eval.ts:101-111` uses nullness in `correct`; wording containment is a soft
  diagnostic.
- `docs/adr/0002-unhandled-clauses-and-the-number-provenance-carve-out.md` requires
  echo/quote behavior and forbids new specifics.
- `src/lib/import-boundaries.test.ts:83-95` forbids parser production code importing
  engine/prose. The validator must live inside `src/lib/parser/` and use no new runtime
  dependency.

Current acceptance excerpt (`src/lib/parser/openai-intent-parser.ts:80-88`):

```ts
const membershipIssue = findMembershipIssue(gate.data, supportedCodes)
if (!membershipIssue) {
  return {
    ...gate.data,
    unhandled: gate.data.unhandled?.trim() || null,
  }
}
```

The parser already has one feedback retry for gate failures. Provenance failure is a
model-output failure and must use that same retry owner; do not silently null the text.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm exec vitest run src/lib/parser/unhandled-provenance.test.ts src/lib/parser/openai-intent-parser.test.ts src/lib/parser/fixtures.test.ts src/lib/import-boundaries.test.ts` | all pass |
| Full tests | `pnpm test` | all pass, network-free |
| Typecheck | `pnpm typecheck` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:

- `src/lib/parser/unhandled-provenance.ts` (new)
- `src/lib/parser/unhandled-provenance.test.ts` (new)
- `src/lib/parser/openai-intent-parser.ts`
- `src/lib/parser/openai-intent-parser.test.ts`
- `src/lib/parser/fixtures.test.ts`
- `scripts/eval.ts`

**Out of scope**:

- TripIntent/ParseResult schema shapes.
- The prose number guard; parser may not import prose.
- Changes to gap policy or UI rendering.
- Prompt tuning, fixture utterance changes, provider/model changes, or new dependencies.
- Live `pnpm eval`; the operator decides when to spend money after deterministic review.

## Git workflow

- Branch: `advisor/002-unhandled-provenance`
- Commit subject: `Enforce unhandled echo provenance`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define a conservative parser-local validator

Create a pure function with an explicit result, for example:

```ts
validateUnhandledProvenance(
  utterance: string,
  unhandled: string | null,
): { ok: true; value: string | null } | { ok: false; issue: string }
```

Requirements:

- Trim whitespace; whitespace-only becomes `null`.
- Normalize case, Unicode apostrophes/dashes, and punctuation for comparison without
  changing the displayed value.
- Each normalized `unhandled` clause must be a contiguous token span of the utterance;
  arbitrary subsequences are forbidden because they can drop negation or reassociate a
  number/symbol with a different phrase. Permit only a tiny documented connective
  allowlist needed to join multiple independently contiguous clauses (for example
  `and`); never allow nouns, adjectives, units, numeric words, or semantic symbols as
  invented glue.
- Account for the complete candidate. Comparison-neutral punctuation may normalize
  away, but comparators, currency/percent/unit symbols, degree marks, arithmetic signs,
  and alphanumeric hyphens are provenance-bearing tokens whose order and multiplicity
  must match the same contiguous source span.
- Every numeric value in `unhandled`, whether digits or cardinal words zero through
  ninety-nine, must have an equivalent value in the utterance. Accept safe display
  normalization such as user `one` -> echo `1`; reject an echo value absent from input.
- Return a generic issue description that does not reproduce the full user/model text.

Do not attempt semantic paraphrase detection. False negatives must trigger the existing
single feedback retry; weakening provenance to accommodate prose is forbidden.

**Verify**: focused validator tests pass for case/punctuation cleanup, exact clause,
multiple clauses, word-to-digit equivalence, invented noun, invented number, and null.

### Step 2: Make provenance part of the parser gate

After Zod and registry membership pass, validate `unhandled` against the original
`utterance`. On failure, populate the existing `GateFailure` and use the same second
attempt as schema/membership failures. After the second failure, throw
`ParserError('invalid_output', ...)`. On success, return the validator's trimmed display
value.

Add adapter tests using `MockLanguageModelV3`:

1. Invented numeric echo fails first attempt, then corrected echo succeeds.
2. Invented lexical echo twice ends in `invalid_output` after exactly two model calls.
3. A faithful echo is returned trimmed after one call.

**Verify**: `pnpm exec vitest run src/lib/parser/openai-intent-parser.test.ts` -> pass.

### Step 3: Harden fixture and live-eval grading

In `fixtures.test.ts`, validate every non-null `expectedUnhandled` against its fixture
utterance. In `scripts/eval.ts`, make both provenance validity and the existing
containment wording check part of `correct` whenever `expectedUnhandled` is non-null.
Keep the wording metric in output if useful, but it may no longer be merely advisory.

Do not require exact byte equality; normalized containment plus the provenance validator
is the contract.

**Verify**: fixture tests pass and `pnpm typecheck` accepts the eval result types.

### Step 4: Run full gates

Run the focused command, full tests, typecheck, and build. Confirm the import-boundary
test still passes and no new dependency appears.

## Test plan

Use `src/lib/prose/number-guard.test.ts` as the table-driven style exemplar and
`src/lib/parser/openai-intent-parser.test.ts` for mocked model attempts. Tests must prove
both halves of the contract: lexical echo provenance and numeric provenance. Include at
least one multiple-clause fixture so the connective rule is intentional rather than an
accidental loophole. Add regressions that reject `not refundable` -> `refundable`,
`under 5 hours, budget 500 dollars` -> `under 500 dollars`, and symbol/number
reassociation; exact degree/unit-symbol echoes must remain valid.

## Done criteria

- [ ] No parser result can return non-null `unhandled` without deterministic provenance
  validation.
- [ ] Invented text takes the existing feedback retry and then fails closed.
- [ ] Every model-authored numeric value displayed through `unhandled` corresponds to a
  user-authored numeric value.
- [ ] Live-eval `correct` includes provenance and wording, not only nullness.
- [ ] No schema shape, prompt, gap, UI, dependency, or import boundary changed.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- [ ] The index status row is updated.

## STOP conditions

- Existing fixtures require semantic paraphrases that cannot satisfy conservative token
  provenance without a broad allowlist.
- The proposed validator needs an engine/prose import or schema change.
- Model retry behavior must exceed the existing two attempts.
- A fix would expose raw utterance/model text in logs or public error bodies.

## Maintenance notes

Reviewers should treat the connective allowlist as security-sensitive: every added word
widens what the model may originate. Future unsupported-clause structure should replace,
not weaken, this validator. If `unhandled` becomes structured in phase 2, migrate the
provenance tests with the display path.
