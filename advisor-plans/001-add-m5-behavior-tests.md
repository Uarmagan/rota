# Plan 001: Add deterministic behavioral coverage for the M5 client lifecycle

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a STOP condition
> occurs, stop and report; do not improvise. When done, update this plan's row in
> `advisor-plans/README.md`, unless a reviewer says they maintain the index.
>
> **Dirty-snapshot prerequisite**: this plan was written while `src/app/ui/` was
> untracked at commit `32d5f8f`. The executor workspace must contain the exact M5
> baseline described below, normally because the operator committed or copied that
> snapshot into the execution worktree. If the files are absent, STOP.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 32d5f8f..HEAD -- package.json pnpm-lock.yaml vitest.config.ts src/app/ui
> shasum -a 256 package.json pnpm-lock.yaml vitest.config.ts src/app/ui/search-app.tsx src/app/ui/stream.ts
> ```
>
> Expected baseline hashes are `345e5851...` (`package.json`), `ecb4670f...`
> (`pnpm-lock.yaml`), `e10b186d...` (`vitest.config.ts`), `9c06cefb...`
> (`search-app.tsx`), and `d462e43f...` (`stream.ts`). Compare full output with
> `advisor-plans/README.md`. Any mismatch is a STOP condition unless it is solely an
> already-completed prerequisite recorded in the index.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `32d5f8f`, 2026-07-13, plus the dirty snapshot above

## Why this matters

The signature product loop now lives in an asynchronous client component, but the only
UI tests cover pure formatting. All 276 tests can pass while a stale parse overwrites a
chip edit, a superseded stream mutates current results, or a parse failure loses the
utterance. This plan establishes observable, deterministic behavior tests before later
plans change those transitions.

## Current state

- `src/app/ui/search-app.tsx:38-155` owns parse submission, intent application,
  cancellation, SSE accumulation, ranking, and explanation fetching.
- `src/app/ui/stream.ts:6-40` parses SSE frames directly from a `ReadableStream` and has
  no test.
- `src/app/ui/format.test.ts` is the UI test style exemplar: Vitest `describe`/`it`,
  explicit assertions, colocated filenames.
- `vitest.config.ts` uses the Node environment globally. Component tests therefore need
  a file-level jsdom environment rather than changing the engine/API suites. Because
  Vite cannot consume Next's string-form Tailwind PostCSS plugin declaration while
  loading `search.css`, test config may set an empty test-only PostCSS plugin list; this
  does not change production CSS processing.

Current orchestration excerpt (`src/app/ui/search-app.tsx:82-96`):

```ts
const submit = async () => {
  const utterance = text.trim()
  if (utterance === '' || parsing) return
  setText('')
  setParsing(true)
  const current = intent ?? createEmptyTripIntent()
  const result = await requestParse(current, utterance)
  setParsing(false)
  if (!result.ok) {
    setText(utterance)
    return
  }
  applyIntent(current, result.intent, result.gap)
}
```

Repository conventions: strict TypeScript, two spaces, single quotes, no semicolons,
trailing commas in multiline structures, `import type` for type-only imports, and no
network in `pnpm test`. Do not test Tailwind class strings or animation timing.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Add test dependencies | `pnpm add -D @testing-library/react @testing-library/user-event jsdom` | exit 0; only requested dev dependencies and lockfile change |
| Focused tests | `pnpm exec vitest run src/app/ui/search-app.test.ts src/app/ui/stream.test.ts` | all focused tests pass |
| Full tests | `pnpm test` | all tests pass with no network |
| Typecheck | `pnpm typecheck` | exit 0, no errors |
| Production gate | `pnpm build` | exit 0 |

## Scope

**In scope**:

- `package.json`
- `pnpm-lock.yaml`
- `vitest.config.ts`
- `src/app/ui/search-app.test.ts` (new; render the component with
  `createElement(SearchApp)` so the repo's `*.test.ts` convention is preserved)
- `src/app/ui/stream.test.ts` (new)
- `src/app/ui/test-support.ts` (new only if shared deferred-response/SSE helpers keep
  the two test files materially simpler)

**Out of scope**:

- Production behavior in `search-app.tsx`, `stream.ts`, `chips.tsx`, or `results.tsx`.
- Fixing the known stale-parse race; Plan 003 owns that regression and implementation.
- Snapshot tests, visual assertions, browser automation, live OpenAI calls, and
  `pnpm eval`.
- Global jsdom configuration; engine and API tests remain Node-based.

## Git workflow

- Branch: `advisor/001-m5-behavior-tests`
- One focused commit, imperative subject such as `Add M5 behavior tests`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add the smallest DOM test surface

Add the three dev dependencies with pnpm. Put `// @vitest-environment jsdom` at the top
of `search-app.test.ts`; do not change the global Vitest environment or the existing
`src/**/*.test.ts` discovery rule. Render with `createElement(SearchApp)`, not JSX. In
`vitest.config.ts`, add only a test-time `css.postcss` configuration with an empty plugin
list so importing the production CSS does not ask Vite to interpret Next's PostCSS
plugin syntax. Configure `userEvent.setup()` per test and call both
`vi.restoreAllMocks()` and `vi.unstubAllGlobals()` after every test in both new suites.

**Verify**: `pnpm exec vitest run src/app/ui/format.test.ts` -> existing UI tests pass.

### Step 2: Test the SSE reader independently

Create `stream.test.ts` using Web `Response`/`ReadableStream` objects and a stubbed
`globalThis.fetch`. Cover:

1. One response chunk containing multiple `batch` frames followed by `done`.
2. A frame split across arbitrary chunk boundaries, proving buffering works.
3. A non-2xx response and a response with no body both reject.
4. Aborting the supplied signal causes iteration to reject or terminate without
   yielding later frames; assert reader cleanup rather than an exact AbortError string.

Assert parsed `SourceBatch` values, not raw string implementation details.

**Verify**: `pnpm exec vitest run src/app/ui/stream.test.ts` -> all new stream tests pass.

### Step 3: Test observable SearchApp transitions

Create a fetch router in the test that handles `/api/parse`, `/api/search`, and
`/api/explain` with deterministic queued responses. Render the real `SearchApp` and
cover only behavior that already works:

1. A successful initial parse renders normalized chips and opens a search request with
   the returned full intent.
2. A parse returning 422 restores the submitted utterance and shows the rephrase error.
3. A parsed destination without dates renders the `When?` prompt and never calls search.
4. Two streamed source batches render progressively and move the visible best badge
   according to the real deterministic engine.
5. A dropped search stream shows the recovery message.
6. A completed stream requests one explanation and renders it only on its matching best
   option.

Use accessible roles/text and controlled deferred promises. Do not assert CSS classes,
exact internal state, or millisecond animation behavior.

**Verify**: `pnpm exec vitest run src/app/ui/search-app.test.ts` -> all new component
tests pass.

### Step 4: Run repository gates

Run focused tests, then full tests, typecheck, and build. Inspect `git status --short`.

**Verify**: all four commands exit 0; changed files are limited to Scope. If build
rewrites tracked generated files such as `next-env.d.ts`, report it rather than silently
including or discarding the change.

## Test plan

The test cases are the work product of this plan. Model pure assertion style after
`src/app/ui/format.test.ts`; model web-response construction after
`src/app/api/search/route.test.ts`. The final count is intentionally not prescribed,
but every numbered behavior above must have a named test and the suite must remain
network-free.

## Done criteria

- [ ] Both new test files exist and pass in one focused command.
- [ ] The component suite follows the documented `.test.ts` convention, uses file-level
  jsdom, and leaves the global Node environment/discovery rule unchanged.
- [ ] The component tests exercise the real `SearchApp`, not a copied reducer or mock
  component.
- [ ] Split SSE frames and progressive UI batches are covered.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm build` exit 0.
- [ ] No production source file changed; only the scoped test configuration changed.
- [ ] No live model request or `pnpm eval` ran.
- [ ] The index status row is updated.

## STOP conditions

- The dirty M5 baseline is absent or does not match the recorded hash.
- A DOM test requires changing the global Vitest environment beyond file-level jsdom.
- Testing the existing behavior appears to require production refactoring.
- The dependency command upgrades/removes unrelated core packages.
- A verification command fails twice after a reasonable test-only correction.

## Maintenance notes

Keep these tests at the interaction-contract level. Plans 003 and 004 should extend
this harness with regressions; they should not replace it with snapshots. If the client
lifecycle is later extracted into a hook/reducer, retain at least one component-level
test for each public transition.
