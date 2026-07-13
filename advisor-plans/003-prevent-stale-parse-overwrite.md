# Plan 003: Prevent stale parse responses from overwriting direct chip edits

> **Executor instructions**: Complete Plan 001 first. Follow every step and gate;
> update `advisor-plans/README.md` when done. Stop on any STOP condition.
>
> **Dirty-snapshot/drift check**:
>
> ```sh
> test -f src/app/ui/search-app.tsx
> git diff --stat 32d5f8f..HEAD -- src/app/ui/search-app.tsx src/app/ui/search-app.test.ts
> shasum -a 256 src/app/ui/search-app.tsx
> ```
>
> The pre-Plan-001 production hash is `9c06cefb243c64ba374974b0e675100c105e575d1a5b469fc5e113f2ee356159`.
> Plan 001 is expected to add tests but not change this production hash. Otherwise STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `advisor-plans/001-add-m5-behavior-tests.md`
- **Category**: bug
- **Planned at**: commit `32d5f8f`, 2026-07-13, plus dirty M5 snapshot

## Why this matters

The parser returns a complete state after LLM latency. While it is pending, the origin
chip remains editable; a newer direct edit can therefore be silently overwritten by the
older full-state response. This violates the core rule that chips are the source of
truth. The fix must cancel paid work when possible and, independently, reject every
stale response by generation.

## Current state

- `src/app/ui/search-app.tsx:51-54` tracks only the active search controller/run.
- `submit` captures `current`, awaits `requestParse`, then applies without a freshness
  check (`:82-96`).
- `pickOrigin` applies direct state immediately and does not invalidate parsing
  (`:99-103`).
- `requestParse` calls `fetch('/api/parse', ...)` without a signal (`:285-307`).

Current stale-response excerpt (`src/app/ui/search-app.tsx:88-96`):

```ts
const current = intent ?? createEmptyTripIntent()
const result = await requestParse(current, utterance)
setParsing(false)
if (!result.ok) {
  setError(result.message)
  setText(utterance)
  return
}
applyIntent(current, result.intent, result.gap)
```

Match the existing search pattern: an `AbortController` handles resource cancellation
and a monotonically increasing ref is the correctness guard. Do not rely on abort alone;
a response can win the race with cancellation.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused test | `pnpm exec vitest run src/app/ui/search-app.test.ts` | all tests pass |
| Full tests | `pnpm test` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:

- `src/app/ui/search-app.tsx`
- `src/app/ui/search-app.test.ts`

**Out of scope**:

- New chip editors or result-row behavior (Plan 004).
- Recomputing/clearing transient `gap` notices during direct edits except where Plan 004
  later centralizes direct editing.
- Search/explanation cancellation, server routes, parser implementation, styling, and
  dependencies.

## Git workflow

- Branch: `advisor/003-stale-parse-guard`
- Commit subject: `Prevent stale parse overwrites`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Write the failing race test

Extend the Plan 001 component harness with a deferred `/api/parse` response:

1. Establish an intent with an editable origin.
2. Submit a refinement and keep its parse response pending.
3. Change the origin chip while the request is pending.
4. Resolve the old parse with a full intent containing the previous origin.
5. Assert the direct origin remains, the stale response does not start a new search,
   and the parsing indicator clears.

Also assert the parse request's signal becomes aborted. The test must fail against the
baseline for the correct reason before production edits.

**Verify**: focused test fails with the stale origin being restored; if it fails for test
plumbing, fix the harness before proceeding.

### Step 2: Add parse generation and cancellation

Add `parseAbortRef` and `parseRun` alongside existing search refs. In `submit`:

- Abort any previous parse defensively.
- Create a controller and increment/capture the generation.
- Pass its signal to `requestParse`.
- After the await, mutate `parsing`, text, error, or intent only if the generation remains
  current and the signal is not aborted.
- Treat abort as an internal supersession result, not as a visible parser error and not
  as a reason to restore the old utterance.

In `pickOrigin`, invalidate/increment the parse generation, abort the active parse, and
clear the parsing indicator before applying the chip edit. Extend unmount cleanup to
abort parse and search.

Give `requestParse` an explicit aborted outcome or return `null`; do not use string
matching on error messages. Preserve current user-facing messages for genuine 422,
transport, and network failures.

**Verify**: the new race test and all pre-existing Plan 001 tests pass.

### Step 3: Add boundary cases

Add tests proving:

- A normal, current parse still applies and clears the spinner.
- An aborted old parse rejecting after a new state transition cannot restore its
  utterance or error.
- Unmount aborts an active parse without an unhandled rejection.

**Verify**: focused suite passes with no fake-timer leakage or act warnings.

### Step 4: Run full gates

Run full tests, typecheck, and build; inspect the diff for exactly the two in-scope files.

## Test plan

Extend the actual component test from Plan 001; do not unit-test a copied state machine.
Use a deferred parse response to pin the lost-update order, and assert both user-visible
state and request cancellation. Keep separate cases for current success, stale success,
stale rejection, and unmount cleanup. Verification is the focused Vitest command above,
then the full repository gates.

## Done criteria

- [ ] Direct chip edits invalidate and abort pending parse work.
- [ ] Generation checks, not abort timing alone, protect every post-await state update.
- [ ] Genuine parse failures retain current copy/restoration behavior.
- [ ] The exact stale-response regression is deterministic and passing.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- [ ] The index status row is updated.

## STOP conditions

- Plan 001 did not land or its component harness cannot defer fetch responses.
- The fix requires changing server API contracts.
- React Strict Mode produces a race that cannot be expressed without broader lifecycle
  extraction; report it instead of introducing global state.
- The change starts touching search/explanation cancellation or new chip UI.

## Maintenance notes

Every future direct intent transition must invalidate pending parser work through one
shared helper. Plan 004 should centralize that helper when adding all chip editors. A
reviewer should scrutinize every state update after an `await` for a generation check.
