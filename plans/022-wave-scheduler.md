# 022 — Wave scheduler: no wave commits while another is playing

- **Status**: DONE (live-verified: wave gaps 694/615/610/587ms, 5 coalesced waves for 29 rows, verdict fired 613ms after the final commit)
- **Commit**: 1bafed1 (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: MEDIUM (user-reported: overlap persists after plan 021)
- **Category**: Cohesion / interruptibility
- **Estimated scope**: 1 file (`src/app/ui/search-app.tsx`), ~45 changed lines

## Problem

Plan 021's fixed 350ms gap between batch commits reduces the pile-up but does
not prevent overlap, because 350ms is shorter than what several waves
actually play:

- The opening cascade runs ~700ms (30ms × up to ~15 rows + the 250ms
  `rota-row` entrance) — wave 2 lands mid-cascade on every search.
- A crown handoff chain runs ~580ms (280ms FLIP-delayed badge + 300ms pop) —
  the next wave shoves rows while the crown is still popping.
- `setStreaming(false)` fires immediately after the last commit, so the
  verdict bloom can start while the final wave's rows are still gliding.

Also, each batch gets its own 350ms slot even when several arrive almost
together, stretching the stream into more waves than needed.

```tsx
// src/app/ui/search-app.tsx:39 — current
const BATCH_GAP_MS = 350 // let one wave settle (280ms FLIP + a beat) before the next
```

```tsx
// src/app/ui/search-app.tsx:153-171 — current (inside startSearch)
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
      if (searchRun.current !== run) return
      setStreaming(false)
      void fetchWhy(searchIntent, collected, run)
    } catch {
      if (controller.signal.aborted || searchRun.current !== run) return
      setStreaming(false)
      setError('The search stream dropped. Try again.')
    }
  }
```

## Target

A wave scheduler with three guarantees:

1. A wave never commits while the previous wave is still playing — the gap is
   each wave's actual play time, not a constant floor.
2. Batches arriving mid-wave coalesce into the NEXT wave (one commit),
   instead of queueing individual slots — fewer, calmer waves, no added
   end-to-end latency beyond the settle windows.
3. `setStreaming(false)` — and therefore the verdict bloom — waits for the
   final wave to settle.

```tsx
// target — replace the BATCH_GAP_MS constant with:
const FIRST_WAVE_SETTLE_MS = 700 // opening cascade: 30ms × ~15 rows + 250ms entrance
const WAVE_SETTLE_MS = 600 // covers the FLIP glide and a crown handoff (280 + 300) + a beat
```

```tsx
// target — replace everything from `const collected` through the end of the
// try/catch shown above with:
    const collected: SourceBatch[] = []
    const pending: SourceBatch[] = []
    let waveEndsAt = 0
    let firstWave = true
    const commitWave = () => {
      collected.push(...pending)
      pending.length = 0
      setBatches([...collected])
      waveEndsAt = Date.now() + (firstWave ? FIRST_WAVE_SETTLE_MS : WAVE_SETTLE_MS)
      firstWave = false
    }
    // Resolves once the playing wave has settled; false if this run went stale.
    const waveSettled = async () => {
      if (motionOk()) {
        const wait = waveEndsAt - Date.now()
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      }
      return searchRun.current === run && !controller.signal.aborted
    }
    try {
      const stream = searchStream(searchIntent, controller.signal)[Symbol.asyncIterator]()
      let nextBatch: Promise<IteratorResult<SourceBatch>> | null = null
      while (true) {
        nextBatch ??= stream.next()
        // While a wave is playing, race the stream against its settle time so
        // batches arriving mid-wave merge into the next wave.
        const { result } =
          pending.length > 0
            ? await Promise.race([
                nextBatch.then((r) => ({ result: r as IteratorResult<SourceBatch> | null })),
                new Promise<{ result: null }>((resolve) =>
                  setTimeout(
                    () => resolve({ result: null }),
                    Math.max(0, waveEndsAt - Date.now()),
                  ),
                ),
              ])
            : { result: await nextBatch }
        if (searchRun.current !== run || controller.signal.aborted) return
        if (result === null) {
          commitWave()
          continue
        }
        nextBatch = null
        if (result.done) break
        pending.push(result.value)
        if (!motionOk() || Date.now() >= waveEndsAt) commitWave()
      }
      if (pending.length > 0) {
        if (!(await waveSettled())) return
        commitWave()
      }
      // The settle beat (verdict bloom) waits for the last wave to finish.
      if (!(await waveSettled())) return
      setStreaming(false)
      void fetchWhy(searchIntent, collected, run)
    } catch {
      if (controller.signal.aborted || searchRun.current !== run) return
      setStreaming(false)
      setError('The search stream dropped. Try again.')
    }
```

Behavior walk-through (for the executor's understanding, not extra code):

- First batch: `pending` empty → plain await; pushed; `waveEndsAt` is 0 so it
  commits immediately and opens a 700ms window.
- A batch arriving inside a window is pushed and held; the race then watches
  for either MORE batches (also held) or the window closing (timer) —
  whichever comes first. Window closes → one coalesced commit.
- Stream ends with held batches → wait out the current wave, commit them.
- Reduced motion / jsdom (`motionOk()` false): every batch commits on
  arrival, all waits are skipped, `pending` never accumulates — the race
  branch never engages and tests keep their synchronous behavior.
- The race's losing timer resolving later is harmless (its `{result: null}`
  is never awaited).
- Stale-run/abort is re-checked after EVERY await, matching the existing
  guard style.

## Repo conventions to follow

- Module-scope timing constants with sync comments (`EXPAND_MS`, `FLIP_MS`
  exemplars); `motionOk()` already exists in this file.
- Guard pattern `searchRun.current !== run || controller.signal.aborted`
  after every await.
- No `useEffect`s, no state for the scheduler — it lives entirely inside the
  existing async function.

## Steps

1. In `src/app/ui/search-app.tsx`, replace the `BATCH_GAP_MS` constant with
   `FIRST_WAVE_SETTLE_MS` and `WAVE_SETTLE_MS` as shown in Target.
2. Replace the body of `startSearch` from `const collected` through the
   `catch` block with the Target version (the function's opening lines —
   abort/controller/run/setBatches/setWhy/setStreaming — are unchanged).
3. Run `pnpm typecheck` and `pnpm test`.

## Boundaries

- Only `src/app/ui/search-app.tsx` changes. Do NOT touch `results.tsx`,
  `stream.ts`, `sources.ts`, or any CSS.
- Do NOT change `fetchWhy`, the error copy, or the parse plumbing.
- Do NOT introduce state/effects for the scheduler.
- Existing tests must keep passing (jsdom takes the unwaited path). If one
  fails, STOP and report — do not rewrite it.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass.
- **Feel check** (the point — judge in the browser, DevTools Animations at
  10% for the first item):
  - Submit "tokyo in feb for 2": the opening cascade completes fully before
    anything else lands. Every subsequent wave plays to stillness — glide,
    entrances, crown pop if any — before the next wave commits. At no moment
    are two waves animating at once.
  - Batches that arrive close together land as ONE wave (watch the row count
    jump once, not twice in quick succession).
  - The verdict bloom and why-line fire only after the final wave is
    completely still.
  - Total stream time is within ~1s of before (coalescing offsets the longer
    settle windows).
  - Submit a new query mid-stream: clean reset, no stale wave flashes.
  - Under `prefers-reduced-motion: reduce`: batches render at raw arrival
    speed, streaming ends immediately after the last batch.
- **Done when**: no two waves ever animate simultaneously, near-simultaneous
  batches coalesce, the finale fires on a still list, and all tests pass.
