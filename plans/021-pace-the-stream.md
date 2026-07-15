# 021 — Pace the result stream into rhythmic waves

- **Status**: DONE
- **Commit**: 1bafed1 (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: MEDIUM (user-reported: streaming feels "violent and rushed")
- **Category**: Cohesion / purpose & frequency
- **Estimated scope**: 2 files (`src/app/ui/search-app.tsx`, `src/app/ui/results.tsx`), ~20 changed lines

## Problem

Results streaming in after submit feels violent. Four compounding causes:

**(a) The first batch is a wall.** The fastest simulated source delivers
12–16 options in one batch (`src/lib/availability/sources.ts:5-15`), and the
entrance stagger caps at 240ms, so rows 7+ all pop in the same frame:

```tsx
// src/app/ui/results.tsx:91-95 — current
  const fresh = options.filter((option) => !enterDelays.current.has(option.id))
  if (options.length === 0) enterDelays.current.clear()
  fresh.forEach((option, index) =>
    enterDelays.current.set(option.id, Math.min(index * 40, 240)),
  )
```

**(b) Waves overlap.** The same source's second batch arrives 200–300ms after
the first — mid-entrance. Batches commit the instant they arrive:

```tsx
// src/app/ui/search-app.tsx — current (inside startSearch)
    const collected: SourceBatch[] = []
    try {
      for await (const batch of searchStream(searchIntent, controller.signal)) {
        if (searchRun.current !== run) return
        collected.push(batch)
        setBatches([...collected])
      }
```

Entrances, FLIP re-rank glides (280ms), and crown handoffs all interrupt each
other; no wave ever completes.

**(c) Invisible holes.** Later-batch rows insert mid-list at their rank
position and hold layout space while waiting out their delay (`rota-row` has
`both` fill → opacity 0 up to 240ms): the list shows gaps that snap shut.

**(d) The trailing shimmer teleports.** It is not FLIP-registered, so every
batch shoves it down instantly while the rows around it glide:

```tsx
// src/app/ui/results.tsx:166-177 — current
      {streaming && (
        <div className="mt-2 space-y-2">
          {options.length === 0 ? (
            <>
              <div className="rota-shimmer h-14 rounded-md" />
              <div className="rota-shimmer h-14 rounded-md" />
              <div className="rota-shimmer h-14 rounded-md" />
            </>
          ) : (
            <div className="rota-shimmer h-14 rounded-md" />
          )}
        </div>
      )}
```

## Target

Rhythm, not slower animation: one wave per batch, each wave finishes before
the next lands.

**1. Pace batch commits** — minimum 350ms between commits (the 280ms FLIP
glide plus a beat); the first batch commits immediately. Pacing exists purely
for choreography, so it is gated on motion: under reduced motion (and in
jsdom, where `matchMedia` is absent and tests stream synchronously) batches
commit at raw speed. A `motionOk()` helper already exists at module scope in
`search-app.tsx` (added with the send-off overlay).

```tsx
// target — module scope in search-app.tsx, next to the other constants
const BATCH_GAP_MS = 350 // let one wave settle (280ms FLIP + a beat) before the next
```

```tsx
// target — inside startSearch, replacing the consume loop shown above
    const collected: SourceBatch[] = []
    let lastCommit = 0
    try {
      for await (const batch of searchStream(searchIntent, controller.signal)) {
        if (searchRun.current !== run) return
        if (motionOk()) {
          const wait = lastCommit + BATCH_GAP_MS - Date.now()
          if (wait > 0) {
            await new Promise((resolve) => setTimeout(resolve, wait))
            if (searchRun.current !== run || controller.signal.aborted) return
          }
        }
        collected.push(batch)
        setBatches([...collected])
        lastCommit = Date.now()
      }
```

(The re-check after the pacing `await` mirrors the existing guard style —
a newer search or an abort during the sleep must drop the stale batch.)

**2. Cascade only on first paint.** The opening reveal gets a full 30ms/row
sweep (uncapped in practice; 600ms safety cap); every later batch enters as
one simultaneous gentle wave (delay 0), which eliminates the mid-list holes:

```tsx
// target — results.tsx, replacing the enterDelays fill
  const fresh = options.filter((option) => !enterDelays.current.has(option.id))
  if (options.length === 0) enterDelays.current.clear()
  // Full cascade only on first paint; later batches land as one wave each.
  const firstPaint = enterDelays.current.size === 0
  fresh.forEach((option, index) =>
    enterDelays.current.set(option.id, firstPaint ? Math.min(index * 30, 600) : 0),
  )
```

**3. FLIP-register the trailing shimmer** under a sentinel id so it glides
down with each wave (`'__shimmer'` can never collide with option ids; the
ref callback already handles unmount cleanup):

```tsx
// target — the streaming block's single-shimmer branch only
          ) : (
            <div
              ref={registerRow('__shimmer')}
              className="rota-shimmer h-14 rounded-md"
            />
          )}
```

The three-shimmer empty state stays unregistered (nothing moves it).

## Repo conventions to follow

- Module-scope timing constants with a sync comment (`EXPAND_MS`,
  `FLIP_MS` exemplars); `motionOk()` gating for choreography-only behavior
  (`results.tsx` and `search-app.tsx` both already define it).
- The abort/stale-run guard pattern after every `await` in `startSearch`
  (`searchRun.current !== run`) — the pacing sleep must follow it.
- No new `useEffect`s; the pacing lives inside the existing async loop.

## Steps

1. In `src/app/ui/search-app.tsx`, add `BATCH_GAP_MS` at module scope and
   replace the consume loop in `startSearch` as shown in Target (add
   `let lastCommit = 0` before `try`, the gated wait inside the loop, and
   `lastCommit = Date.now()` after `setBatches`).
2. In `src/app/ui/results.tsx`, replace the `enterDelays` fill with the
   `firstPaint` version from Target.
3. In `src/app/ui/results.tsx`, add the `registerRow('__shimmer')` ref to
   the single trailing shimmer div (not the three-block empty state).
4. Run `pnpm typecheck` and `pnpm test`.

## Boundaries

- Do NOT change the simulated source timings in
  `src/lib/availability/sources.ts` — the pacing lives at the consumer.
- Do NOT change `useFlip`, `FLIP_MS`, the crown/verdict logic, `rota-row`'s
  duration/easing, or the entrance keyframes.
- Do NOT pace `fetchWhy` or the parse round trip — batches only.
- Existing tests must keep passing (jsdom takes the unpaced path). If one
  fails, STOP and report — do not rewrite it.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass.
- **Feel check** (the point of this plan — judge in the browser):
  - Submit "tokyo in feb for 2": the first batch sweeps in top-to-bottom as
    one deliberate cascade (~half a second for a full screen), then each
    subsequent batch lands as a distinct, complete wave — glide, settle,
    next — with no two waves overlapping.
  - No gaps ever appear mid-list that later snap shut.
  - The shimmer block at the bottom rides down smoothly with each wave
    instead of jumping.
  - Total time-to-complete barely changes (pacing only defers a batch that
    arrived <350ms after the previous one; the slowest source still
    dominates), and the verdict bloom/why-line finale still fires at settle.
  - Submit a new query mid-stream: the old stream dies cleanly (no stale
    batch flashes after the reset).
  - Under `prefers-reduced-motion: reduce`: batches render at raw arrival
    speed with the gentle fades — no added latency.
- **Done when**: streaming reads as calm, rhythmic waves; first paint is a
  single cascade; no holes; no shimmer jumps; all tests pass.
