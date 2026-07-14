# 016 — Gate the FLIP to rank-order changes

- **Status**: DONE
- **Commit**: d1147bf (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: HIGH
- **Category**: Interruptibility / cohesion
- **Estimated scope**: 1 file (`src/app/ui/results.tsx`), ~10 changed lines

## Problem

Switching the expanded row (plan 015's close-then-open sequencing) looks
erratic: rows below the closing section slide up with the grid transition,
then visibly replay that slide, then get pushed again by the opening section.

Root cause: `useFlip` measures every row's `offsetTop` on every render and
animates any delta. The sequencing timer re-renders exactly when the collapse
transition ends, so FLIP compares a baseline captured at the *pre-collapse*
layout against the *post-collapse* layout and "corrects" a movement the CSS
grid transition already performed — double motion that fights the expand that
starts in the same frame. (The stale-baseline bug predates plan 015; the
timer just made it fire on every switch.)

```tsx
// src/app/ui/results.tsx — current (useFlip; below the getFlipEasing helper)
function useFlip() {
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const tops = useRef(new Map<string, number>())
  const moves = useRef(new Map<string, Animation>())

  useLayoutEffect(() => {
    // matchMedia/animate are absent under jsdom; FLIP is a browser-only flourish.
    const reduceMotion =
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const nextTops = new Map<string, number>()
    for (const [id, el] of nodes.current) nextTops.set(id, el.offsetTop)
    if (!reduceMotion) {
      for (const [id, el] of nodes.current) {
        const before = tops.current.get(id)
        if (before === undefined) continue
        const dy = before - nextTops.get(id)!
        if (Math.abs(dy) < 2) continue
        moves.current.get(id)?.cancel()
        moves.current.set(
          id,
          el.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
            { duration: 280, easing: getFlipEasing() },
          ),
        )
      }
    }
    tops.current = nextTops
  })

  return (id: string) => (el: HTMLDivElement | null) => {
    if (el) nodes.current.set(id, el)
    else {
      nodes.current.delete(id)
      moves.current.delete(id)
    }
  }
}
```

```tsx
// src/app/ui/results.tsx:77 — current call site (inside Results)
  const registerRow = useFlip()
```

## Target

FLIP's stated purpose (file header, lines 3–5) is making batch re-ranks
legible. Gate the animation on the rank order actually changing; keep
refreshing the measurement baseline on every render so it is never stale.
Expand/collapse displacement then belongs entirely to the `.rota-expand` grid
transition — no double motion.

```tsx
// target — useFlip takes the current rank order; animates only when it changes
function useFlip(orderKey: string) {
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const tops = useRef(new Map<string, number>())
  const moves = useRef(new Map<string, Animation>())
  const lastOrder = useRef<string | null>(null)

  useLayoutEffect(() => {
    // matchMedia/animate are absent under jsdom; FLIP is a browser-only flourish.
    const reduceMotion =
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Only re-ranks FLIP; expand/collapse displacement belongs to .rota-expand.
    const orderChanged =
      lastOrder.current !== null && lastOrder.current !== orderKey
    lastOrder.current = orderKey
    const nextTops = new Map<string, number>()
    for (const [id, el] of nodes.current) nextTops.set(id, el.offsetTop)
    if (!reduceMotion && orderChanged) {
      for (const [id, el] of nodes.current) {
        const before = tops.current.get(id)
        if (before === undefined) continue
        const dy = before - nextTops.get(id)!
        if (Math.abs(dy) < 2) continue
        moves.current.get(id)?.cancel()
        moves.current.set(
          id,
          el.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
            { duration: 280, easing: getFlipEasing() },
          ),
        )
      }
    }
    tops.current = nextTops
  })

  return (id: string) => (el: HTMLDivElement | null) => {
    if (el) nodes.current.set(id, el)
    else {
      nodes.current.delete(id)
      moves.current.delete(id)
    }
  }
}
```

```tsx
// target — call site
  const registerRow = useFlip(options.map((option) => option.id).join('|'))
```

Accepted behaviors, not bugs:

- The why-line's arrival no longer FLIPs the rows below it — they nudge down
  instantly while the paragraph fades in. Small, and far better than the
  double-motion this plan removes.
- If a batch re-ranks the list while an expand/collapse transition is
  mid-flight, that one FLIP measures a mid-transition baseline. Rare
  coincidence; self-corrects on the next settled measurement.

## Repo conventions to follow

- Keep the effect dependency-less (it must re-measure every render to stay
  fresh) and keep the existing comment style — the one new comment line in
  Target states the gating rationale.
- The baseline refresh (`tops.current = nextTops`) stays OUTSIDE the
  `orderChanged` gate — that is the point of the fix; do not "optimize" it
  inside.

## Steps

1. In `src/app/ui/results.tsx`, change `useFlip()` to `useFlip(orderKey: string)`,
   add the `lastOrder` ref, compute `orderChanged`, and add `&& orderChanged`
   to the animate gate, exactly as in Target.
2. Update the call site to
   `useFlip(options.map((option) => option.id).join('|'))`.

## Boundaries

- Do NOT change the animation itself (280ms, `getFlipEasing()`, dy<2 skip),
  the registration callback, `toggleExpanded`, or anything in `search.css`.
- Do NOT add effect dependencies or convert the refs to state.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass (`results.test.ts`
  must not regress; jsdom never runs the animate path either way).
- **Feel check** (the real gate — do this at 10% playback in DevTools →
  Animations where noted):
  - Expand row A, click row B: A closes, then B opens, and the rows between
    them make exactly ONE smooth movement per phase — no replayed slide, no
    counter-glide. This is the bug being fixed.
  - Run a fresh multi-source search and let batches land: rows still GLIDE to
    their new slots when the ranking re-sorts (the gate must not kill the
    re-rank FLIP).
  - Expand the ★ BEST row before the why-line arrives: the paragraph fades
    in; rows below nudge instantly (accepted tradeoff, see above).
  - Rapidly click between three different rows: motion stays sequential and
    clean; nothing wobbles.
- **Done when**: switching expanded rows produces no FLIP corrections, batch
  re-ranks still glide, and all tests pass.
