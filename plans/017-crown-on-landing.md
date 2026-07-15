# 017 — Crown the winner when its row lands

- **Status**: DONE
- **Commit**: d1147bf (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: LOW (delight; signature moment)
- **Category**: Missed opportunity
- **Estimated scope**: 1 file (`src/app/ui/results.tsx`), ~20 lines

## Problem

`bestMatch` is always the top-ranked option (`src/lib/engine/rank.ts:53-57`),
so the ★ BEST badge always sits on row 1. When a landing batch changes the
best, plan 016's FLIP glides the challenger up into the top slot over 280ms —
but the badge mounts (and plays its bounce) at commit time, while its row is
still mid-glide. The crowning happens before the winner has arrived, which
reads as a glitch rather than a verdict.

```tsx
// src/app/ui/results.tsx:217-229 — current (inside Row's price column)
        <span className="w-24 text-right">
          <span className="block text-base font-semibold text-neutral-50 tabular-nums">
            {formatUsd(price.totalUsd)}
          </span>
          {isBest && (
            <span
              key={option.id}
              className="rota-badge inline-block rounded bg-indigo-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300"
            >
              ★ BEST
            </span>
          )}
        </span>
```

The FLIP duration is currently a magic number inside `useFlip`:

```tsx
// src/app/ui/results.tsx — current (inside useFlip's animate call)
            { duration: 280, easing: getFlipEasing() },
```

## Target

When the best *changes hands* (there was a previous, different best in this
search), delay the badge's pop by exactly the FLIP duration, so it stamps down
as the row settles into pole position. `rota-badge` uses `both` fill
(`search.css:44`), so the badge is invisible (opacity 0) during the delay —
the crown is genuinely "in the air" while the race resolves. First-ever best
of a search keeps delay 0 (it pops with its row's entrance). Under reduced
motion (or jsdom) there is no glide, so no delay — no dead pause, no test
churn.

```tsx
// target — module scope, above Results
const FLIP_MS = 280

// jsdom has no matchMedia; treat that as reduced motion, like useFlip does.
function motionOk(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
```

```tsx
// target — inside Results, directly after the `fresh.forEach(...)` block that
// fills enterDelays (same render-time-ref idempotent convention)
  // The crown lands with its row: on a mid-stream handoff, delay the badge
  // pop by the FLIP glide so the winner is crowned on arrival.
  const crown = useRef<{ id: string | null; delayMs: number }>({
    id: null,
    delayMs: 0,
  })
  if (options.length === 0) crown.current = { id: null, delayMs: 0 }
  if (bestId !== crown.current.id) {
    crown.current = {
      id: bestId,
      delayMs: crown.current.id !== null && motionOk() ? FLIP_MS : 0,
    }
  }
```

```tsx
// target — the Row invocation gains one prop
          badgeDelayMs={crown.current.delayMs}
```

```tsx
// target — Row: add `badgeDelayMs: number` to props (after `enterDelayMs`),
// and the badge span gains a style:
          {isBest && (
            <span
              key={option.id}
              style={{ animationDelay: `${badgeDelayMs}ms` }}
              className="rota-badge inline-block rounded bg-indigo-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300"
            >
              ★ BEST
            </span>
          )}
```

```tsx
// target — useFlip's animate options use the shared constant
            { duration: FLIP_MS, easing: getFlipEasing() },
```

Deliberately unchanged: the winner row's indigo tint (`border-l`/`bg`) already
eases via the row's `transition-colors`, and the incumbent's badge unmounting
instantly at commit is correct — the crown being briefly absent while rows
race is the point.

## Repo conventions to follow

- The `crown` ref uses the same idempotent render-time-ref pattern as
  `enterDelays` (`results.tsx:80-84`) — guarded writes so StrictMode's double
  render is harmless. Do not convert it to state or an effect.
- Comment style: one line for the non-obvious constraint, nothing more.
- `useRef` is already imported.

## Steps

1. Add `FLIP_MS` and `motionOk()` at module scope, above `Results` (next to
   the existing `EXPAND_MS`).
2. Add the `crown` ref block inside `Results` after the `enterDelays` fill.
3. Pass `badgeDelayMs={crown.current.delayMs}` to `Row`.
4. Add `badgeDelayMs: number` to `Row`'s props and the
   `style={{ animationDelay: ... }}` on the badge span.
5. In `useFlip`, replace `duration: 280` with `duration: FLIP_MS`.

## Boundaries

- Do NOT change `rota-badge`'s keyframes, duration, or bounce easing in
  `search.css`.
- Do NOT touch `useFlip`'s gating/measurement (beyond the duration constant),
  `toggleExpanded`, or the incumbent badge's unmount behavior.
- Do NOT refactor the existing inline `matchMedia` checks in `useFlip`/
  `toggleExpanded` to use `motionOk()` — out of scope here.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass (jsdom takes the
  `motionOk() === false` path, so badge timing in tests is unchanged).
- **Feel check** (DevTools → Animations at 10% playback for the first two):
  - Run a multi-source search and watch a mid-stream re-rank that changes the
    best: the incumbent's crown disappears, rows glide, and the ★ BEST badge
    pops onto the new top row just as it settles — never mid-flight.
  - First batch of a fresh search: the badge pops together with its entering
    row — no added delay.
  - Re-run several searches back-to-back: no stale crowns, no badge stuck
    invisible.
  - Under emulated `prefers-reduced-motion: reduce`: best changes swap the
    badge with the gentle fade immediately — no dead 280ms wait.
- **Done when**: on handoffs the crown lands with the row, first crowns are
  immediate, and all tests pass.
