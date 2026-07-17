# Session restore — implementation plan (issue #10)

Self-contained plan for GitHub issue #10: the committed `TripIntent` survives a
same-tab refresh via sessionStorage. All design decisions are FINAL (recorded in the
issue, 2026-07-15 grilling session; concept already captured as **Session restore** in
`CONTEXT.md`). Read PRD.md, ARCHITECTURE.md, CONTEXT.md, and CLAUDE.md first; their
invariants bind everything here.

> Follow-up, 2026-07-17: the user explicitly added a **New search** action that clears
> the committed intent and returns to the blank landing page. This supersedes the
> original no-clear/reset-UI constraint below; the rest of this historical plan stands.

## Hard constraints (violations fail review)

- `src/lib/engine` stays pure TS. The new storage module is UI-side
  (`src/app/ui/intent-storage.ts`) because it touches a browser API — do NOT put it
  under `src/lib/engine` or `src/lib/schema`. `src/lib/import-boundaries.test.ts`
  must keep passing untouched.
- Restore never spends a paid model call: no `/api/parse` call, and `/api/explain`
  (the why-line) is suppressed for the restore-triggered search run only.
  `/api/search` is free (seeded simulation) and IS re-run.
- No URL state, no share affordance, no cross-tab sync, no clear/reset UI, no ADR.
- Never `any`. Comments sparse. pnpm only. Verify with `pnpm typecheck` and
  `pnpm test`; do not run `pnpm dev` or `pnpm build`.
- `src/app/ui/search-app.tsx` carries unrelated uncommitted stream-pacing/wave work.
  Implement against the live file state and keep this diff surgical — do not touch
  the wave logic, and do not revert or sweep in those changes.

## Locked decisions

| # | Decision |
|---|---|
| 1 | **sessionStorage, key `rota:intent:v1`.** Per-tab, same-origin, survives refresh, not shareable. No stored version field — `tripIntentSchema` IS the version; a deliberate future break bumps the key suffix. |
| 2 | **Persist the committed `TripIntent` only, including partial intents** (e.g. destination still null). Never persisted: draft input text, `unhandled` echo, errors, streamed batches, why-line, animation state. The prompt chip reappears on restore via `checkGaps(intent, null)`; an `unhandled`-flavored follow-up degrades to the plain destination ask — correct by design. |
| 3 | **On restore of a searchable intent, auto-run the search with the why-line suppressed** for that run. The why-line returns on the next real intent change (any path through `applyIntent`). |
| 4 | **Load gate is all-or-nothing, silent discard.** `JSON.parse` → `tripIntentSchema.safeParse` → re-canonicalize places via the engine's existing `canonicalizePlaces` (registry city label wins; `UnknownPlaceError` rejects). Any failure → discard the blob and start blank; no error UI, no console noise. No past-date check. |
| 5 | **Reject a `country`-shaped destination at load.** Committed intents are always normalized (`fillAssumptions` resolves countries to a concrete place before commit), so a stored country destination can only be tampering — discard. This keeps "diff, gap policy, and search only ever see normalized intents" true across the restore boundary. |
| 6 | **No chip entrance animation on restore.** A refresh should read as continuity, not a replay: set state directly (empty animations map), do not synthesize a diff cascade. |

## Work items

### 1. `src/app/ui/intent-storage.ts` (new)

All sessionStorage/JSON/Zod/canonicalization knowledge lives here; `SearchApp` never
touches the key or the parsing.

```ts
saveIntent(intent: TripIntent): void
loadIntent(): TripIntent | null
```

- `saveIntent`: `sessionStorage.setItem(KEY, JSON.stringify(intent))` inside
  try/catch — storage can be disabled or full; a failed save is silently dropped
  (persistence is best-effort, never load-bearing).
- `loadIntent`:
  1. `sessionStorage.getItem(KEY)`; null → return null.
  2. `JSON.parse` in try/catch.
  3. `tripIntentSchema.safeParse` (import from `src/lib/schema/trip-intent`).
  4. Reject if `intent.destination` is non-null and not resolved — use the existing
     `isResolvedDestination` guard (decision 5).
  5. `canonicalizePlaces(intent)` from `src/lib/engine/normalize` in try/catch
     (throws `UnknownPlaceError` on unknown IATA). This overwrites any stale stored
     city label with the registry's, mirroring the parser boundary.
  6. Any failure at any step → return null (optionally `removeItem` so a corrupt
     blob isn't re-parsed every refresh). Return the canonicalized intent on success.
- Export the key as a constant only if the tests need it; otherwise keep it private.

Importing from `src/lib/engine` and `src/lib/schema` into `src/app/ui` is already the
normal direction (see `search-app.tsx`); no boundary change needed.

### 2. `src/app/ui/search-app.tsx`

Three surgical edits:

1. **Save on commit.** One `saveIntent(next)` call at the top of `applyIntent`
   (before the searchable check and the identity-re-emission early return).
   `applyIntent` is already the single commit funnel for both parse results and
   direct chip edits — nothing else writes.
2. **Why-line suppression.** Give `startSearch` an opt-out, e.g.
   `startSearch(searchIntent: TripIntent, opts?: { skipWhy?: boolean })`, and skip
   the `void fetchWhy(...)` call at the end of the stream when set. Every existing
   call site stays unchanged (defaults to fetching); only the restore path passes
   `{ skipWhy: true }`.
3. **One-shot mount effect.**

   ```ts
   useEffect(() => {
     const stored = loadIntent()
     if (stored === null) return
     const restoredGap = checkGaps(stored, null)
     setIntent(stored)
     setGap(restoredGap)
     if (restoredGap.kind !== 'follow_up' && stored.dates !== null) {
       void startSearch(stored, { skipWhy: true })
     }
   }, [])
   ```

   - A mount effect (not a `useState` initializer) is required: the component
     server-renders, and reading sessionStorage during render would be a hydration
     mismatch. This is the legitimate external-system-sync exception to the
     minimize-useEffect rule — note it in a one-line comment.
   - The searchable predicate mirrors `applyIntent`'s
     (`gap.kind !== 'follow_up' && dates !== null`) — don't invent a new one.
   - Do not touch `animations`/`runId` (decision 6); chips render statically.
   - React StrictMode dev double-invoke: the second `startSearch` aborts the first
     via the existing `abortRef`/`searchRun` machinery and produces the same result,
     so no dedupe ref is needed. Do not add one unless a test proves otherwise.
   - Suppress the eslint exhaustive-deps warning the way the codebase already does
     if it fires (the existing unmount-cleanup effect at the top is the pattern).

No other UI changes: no clearing affordance, no restore indicator.

### 3. Tests

Follow the existing patterns in `src/app/ui/search-app.test.ts`
(`// @vitest-environment jsdom` pragma, testing-library, mocked `fetch`).

`src/app/ui/intent-storage.test.ts` (jsdom for sessionStorage):

- Round-trips a full searchable intent and a partial intent (destination null).
- `loadIntent` returns null for: absent key, corrupt JSON, schema-invalid blob
  (e.g. `travelers: 12`, missing `constraints`), unknown IATA (`{ iata: 'XXX' }`),
  and a country-shaped destination.
- A stored stale city label (`{ iata: 'NRT', city: 'Old Tokyo Label' }`) loads with
  the registry's label (`'Tokyo'`).
- `saveIntent` does not throw when `setItem` throws (stub storage to throw).

`src/app/ui/search-app.test.ts` additions:

- Restore of a partial intent: seed sessionStorage, render, chips + destination
  prompt chip appear, no fetch fired.
- Restore of a searchable intent: search stream starts (mocked `/api/search`) and
  `/api/explain` is **never** called.
- A bad blob yields the normal blank landing page (heading + placeholder, no chips,
  no error).
- A post-restore refinement (direct chip edit or parse) re-enables the why-line
  (`/api/explain` called on that run).
- A committed intent lands in sessionStorage under `rota:intent:v1` after a parse
  commit (save-side wiring, not just the module in isolation).

Clean sessionStorage between tests (`sessionStorage.clear()` in the existing
`afterEach` alongside `cleanup()`).

### 4. Docs

- `ROADMAP.md`: mark the session-restore item done / add it as landed (issue #10).
- `CONTEXT.md` already carries the **Session restore** concept — verify the
  implementation matches it; do not edit unless something diverged.
- No ADR (decision 5 in the issue: sessionStorage-over-URL is cheap to reverse).

## Verification

`pnpm typecheck` and `pnpm test` green, including the untouched
`import-boundaries.test.ts`. Manual sanity (optional, dev server assumed running):
type an utterance, refresh — chips and results return, no why-line; edit a chip —
why-line returns.
