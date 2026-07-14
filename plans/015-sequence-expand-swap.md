# 015 — Sequence row expand when switching options

- **Status**: DONE
- **Commit**: d1147bf (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: MEDIUM
- **Category**: Cohesion / interruptibility
- **Estimated scope**: 1 file (`src/app/ui/results.tsx`), ~30 lines

## Problem

With row A's details open, clicking row B flips `expandedId` directly from A
to B, so A collapses and B expands in the same frame — two 200ms grid-rows
transitions fighting for attention, and the rows between them slide in both
directions at once. Product decision: the open section must finish closing
before the target opens.

```tsx
// src/app/ui/results.tsx:40 — current
const [expandedId, setExpandedId] = useState<string | null>(null)
```

```tsx
// src/app/ui/results.tsx:84-86 — current (inside the options.map Row props)
onToggle={() =>
  setExpandedId((current) => (current === option.id ? null : option.id))
}
```

The collapse/expand transition is `.rota-expand` at `src/app/ui/search.css:66-68`
(200ms, `grid-template-rows`); under `prefers-reduced-motion: reduce` it is
`transition: none` (instant).

## Target

A toggle handler that, when switching between rows, collapses first and
schedules the expand for when the collapse transition has finished (200ms —
timer-based, because `transitionend` never fires under reduced motion or
jsdom). Same-row toggling and opening-from-nothing stay immediate. Under
reduced motion (or jsdom, where `matchMedia` is absent) the collapse is
instant, so the swap happens synchronously — no dead 200ms pause, and tests
keep their current synchronous behavior.

```tsx
// target — module scope in src/app/ui/results.tsx
const EXPAND_MS = 200 // keep in sync with the .rota-expand duration in search.css
```

```tsx
// target — inside Results, replacing the expandedId line
const [expandedId, setExpandedId] = useState<string | null>(null)
const collapseTimer = useRef<number | null>(null)

const clearPendingExpand = () => {
  if (collapseTimer.current !== null) {
    window.clearTimeout(collapseTimer.current)
    collapseTimer.current = null
  }
}
useEffect(() => clearPendingExpand, [])

// Switching rows: let the open section finish closing before the target opens.
const toggleExpanded = (id: string) => {
  clearPendingExpand()
  if (expandedId === id) {
    setExpandedId(null)
    return
  }
  if (expandedId === null) {
    setExpandedId(id)
    return
  }
  setExpandedId(null)
  const animated =
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!animated) {
    setExpandedId(id)
    return
  }
  collapseTimer.current = window.setTimeout(() => {
    collapseTimer.current = null
    setExpandedId(id)
  }, EXPAND_MS)
}
```

```tsx
// target — the Row prop
onToggle={() => toggleExpanded(option.id)}
```

Accepted behaviors, not bugs:

- Clicking a third row (or re-clicking) during the collapse window re-routes:
  `clearPendingExpand()` cancels the scheduled expand and the handler
  re-evaluates from the now-collapsed state.
- If a pending expand fires for an option that a new batch just removed, the
  existing cleanup effect (`results.tsx:50-54`) nulls it on the next render.

## Repo conventions to follow

- `useRef`/`useEffect` are already imported in `results.tsx:7`.
- The `matchMedia` guard mirrors `useFlip` (`results.tsx:139-142` area):
  absent `matchMedia` (jsdom) is treated as reduced motion.
- Comment style: one line stating the non-obvious constraint, nothing more.
- Per user CLAUDE.md, no new `useEffect` beyond the single unmount cleanup
  shown in Target.

## Steps

1. In `src/app/ui/results.tsx`, add `const EXPAND_MS = 200` (with the
   keep-in-sync comment) at module scope, above the `Results` component.
2. Inside `Results`, directly after the `expandedId` useState line, add
   `collapseTimer`, `clearPendingExpand`, the unmount cleanup effect, and
   `toggleExpanded` exactly as in Target.
3. Replace the `onToggle` prop's inline updater with
   `onToggle={() => toggleExpanded(option.id)}`.

## Boundaries

- Do NOT change `.rota-expand` in `search.css`, the existing
  vanished-option cleanup effect, the FLIP hook, or `Row` itself.
- Do NOT use `transitionend` listeners or add state beyond the ref.
- Do NOT change the 200ms duration on either side.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass —
  `results.test.ts` and `search-app.test.ts` must not regress (jsdom takes
  the synchronous path, so existing expand/switch tests should pass
  unchanged; if one fails, report it rather than rewriting it).
- **Feel check**: run a search, expand row A, then click row B:
  - A closes fully (200ms), THEN B opens (200ms) — at no point are two
    sections animating at once. Watch at 10% playback via DevTools →
    Animations.
  - Click A again mid-close-of-A-open-of-B chain: no stuck states; the last
    click wins.
  - Same-row open/close and first-open are as snappy as before (no added
    delay).
  - Under emulated `prefers-reduced-motion: reduce`, switching rows swaps
    instantly with no 200ms dead wait.
- **Done when**: switching rows is strictly close-then-open, rapid clicking
  never wedges the UI, and all tests pass.
