# Plan 024: Move result animation bookkeeping out of React render

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update only this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 008d4db -- src/app/ui/results.tsx src/app/ui/results.test.ts`
> This command is expected to show uncommitted follow-on motion work in
> `results.tsx`. Compare the live file against the "Current state" section. Stop
> if the named `enterDelays`, `crown`, or `verdict` mechanisms were removed or
> replaced after this plan was written.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `008d4db` plus observed uncommitted motion follow-ons, 2026-07-14

## Why this matters

`Results` mutates persistent refs while React is rendering and then uses those
values to choose entrance, crown, and verdict animation behavior. React may
restart or discard a render, so those mutations can mark rows as seen or advance
the winner state even though the corresponding UI never committed. The result is
intermittently skipped or mistimed motion in the exact surface intended to make
streaming search feel polished.

## Current state

- `src/app/ui/results.tsx` is currently dirty with follow-on animation work. Do
  not discard or overwrite it.
- The live file contains render-time mutations equivalent to:

  ```ts
  const enterDelays = useRef(new Map<string, number>())
  if (options.length === 0) enterDelays.current.clear()
  fresh.forEach((option, index) => enterDelays.current.set(option.id, ...))

  const crown = useRef(...)
  if (bestId !== crown.current.id) crown.current = ...

  const verdict = useRef(...)
  if (streaming) verdict.current = ...
  ```

- Those values directly control `enterDelayMs`, `badgeDelayMs`, and `verdict`
  props passed to each row.
- The existing `useFlip` hook mutates DOM/animation refs inside
  `useLayoutEffect` and callback refs. That is the correct phase; it is not the
  target of this plan.
- `src/app/ui/results.test.ts` runs in jsdom. With no `matchMedia`, production
  motion branches are treated as reduced motion and are not meaningfully tested.
- Binding repo constraint: preserve reduced-motion behavior and the current
  expansion/FLIP timing. Do not run `pnpm build`; `CLAUDE.md` asks for test and
  typecheck verification unless a build was explicitly requested.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused UI test | `pnpm exec vitest run src/app/ui/results.test.ts` | all pass |
| Related integration | `pnpm exec vitest run src/app/ui/search-app.test.ts` | all pass |
| Find render ref access | `rg -n "enterDelays\.current|crown\.current|verdict\.current" src/app/ui/results.tsx` | no reads/writes in `Results` render body |
| Typecheck | `pnpm typecheck` | exit 0 |
| Full suite | `pnpm test` | all tests pass |
| Diff hygiene | `git diff --check` | no output |

## Suggested executor toolkit

- Read the official React `useRef` pitfall before implementation:
  `https://react.dev/reference/react/useRef#avoiding-recreating-the-ref-contents`.
- If available, use a React best-practices review skill after the refactor, but
  do not let it broaden the file scope.

## Scope

**In scope**:

- `src/app/ui/results.tsx`
- `src/app/ui/results.test.ts`
- Administrative exception: update only plan 024's row in `plans/README.md`

**Out of scope**:

- `src/app/ui/search-app.tsx`, `chips.tsx`, or `search.css`; these contain
  unrelated uncommitted user work
- Changing motion durations, easing tokens, visual design, or wave scheduling
- Replacing the FLIP implementation
- Adding a site-wide state manager or animation dependency

## Git workflow

- Branch: `advisor/024-pure-animation-bookkeeping`
- Preserve the existing dirty motion work. Stage only this plan's intended
  hunks if committing from the shared checkout.
- Use one focused commit such as `Make result motion render-pure`.
- Do not push or open a PR unless explicitly requested.

## Steps

### Step 1: Add regression coverage around replayed renders

Extend `src/app/ui/results.test.ts` with a harness that supplies a working
`matchMedia` and a stubbed `Element.prototype.animate`. Exercise:

- initial batch entrance delays;
- a second batch arriving and causing a best-result handoff;
- stream completion firing the verdict once;
- rerendering the same props does not replay entrance/crown/verdict state;
- `StrictMode` does not change the observable animation metadata.

Test behavior, not implementation details. Prefer asserted row styles/classes
and animation calls over inspecting private hook state.

**Verify**: `pnpm exec vitest run src/app/ui/results.test.ts` should expose at
least one failing replay/purity assertion before the refactor.

### Step 2: Define committed animation state explicitly

Refactor entrance, crown, and verdict history so render is a pure calculation
from props and React state. State transitions or ref mutations must happen in an
event handler, callback ref, `useEffect`, or `useLayoutEffect`, never in the
component render body.

Required behavioral invariants:

- the first committed result wave keeps its stagger;
- later rows enter once, not on every parent rerender;
- a mid-stream best handoff delays the badge until the FLIP lands;
- stream completion fires one verdict for the final best option;
- an empty result set resets per-search animation history;
- reduced motion removes delays and browser animation work.

Keep the implementation local to `Results`; a small dedicated hook or reducer
inside `results.tsx` is preferred over widening component props.

**Verify**: `rg -n "enterDelays\.current|crown\.current|verdict\.current" src/app/ui/results.tsx`
must show no render-body reads/writes for these mechanisms. Effect-local or
callback-local refs are acceptable only if they do not determine JSX during the
same render.

### Step 3: Run focused and full verification

Run the result tests, the search-app tests, typecheck, and the full suite. Review
the diff to ensure no unrelated dirty motion work was reformatted or staged.

**Verify**:

- `pnpm exec vitest run src/app/ui/results.test.ts src/app/ui/search-app.test.ts` → all pass
- `pnpm typecheck` → exit 0
- `pnpm test` → all tests pass
- `git diff --check` → no output
- `git diff --name-only` → no newly modified implementation files outside scope

## Test plan

- Reuse the existing `first` and `second` result fixtures.
- Add a third batch or rerender only if needed to distinguish entrance from
  handoff behavior.
- Stub browser motion APIs explicitly so the test does not silently take the
  reduced-motion branch.
- Include a reduced-motion assertion proving no WAAPI call occurs.

## Done criteria

- [ ] No entrance, crown, or verdict history is mutated during render.
- [ ] Initial, later-wave, handoff, settle, repeated-render, and reduced-motion
      behaviors have explicit tests.
- [ ] Existing visual timing constants and CSS class contracts are unchanged.
- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm test` passes.
- [ ] `git diff --check` returns no output.
- [ ] Unrelated dirty UI files and hunks remain untouched.
- [ ] Plan 024's status row is updated in `plans/README.md`.

## STOP conditions

Stop and report if:

- The current dirty `results.tsx` no longer contains the named mechanisms.
- Preserving behavior appears to require changes to `search-app.tsx` or
  `search.css`.
- React enters an infinite rerender loop or state must be updated directly from
  render to make the design work.
- A browser-motion test is impossible without adding a new dependency.
- Any verification fails twice after a reasonable correction.

## Maintenance notes

- Reviewers should focus on commit-vs-render timing: aborted renders must not
  advance animation history.
- Keep DOM animation handles in effects/refs; only render-visible transition
  state belongs in React state.
