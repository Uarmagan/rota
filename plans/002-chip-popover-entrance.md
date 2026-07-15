# 002 — Give the chip editor popover an entrance from its trigger

- **Status**: DONE (executed 2026-07-14; the parallel hand-written keyframe variant made this partially redundant — plan 008 removes this plan's leftover CSS)
- **Commit**: d1147bf
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 2 files (`src/app/ui/chips.tsx`, `src/app/ui/search.css`), ~15 lines

Depends on plan 001 (uses `--ease-out-strong`).

## Problem

The chip editor panel — the most-used surface after the input — appears by
conditional mount with zero motion and no origin. It teleports in below its
trigger chip:

```tsx
// src/app/ui/chips.tsx:18-19 — current
const PANEL =
  'absolute top-full left-0 z-20 mt-1.5 min-w-52 rounded-lg border border-white/10 bg-[#17171f] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.6)]'
```

```tsx
// src/app/ui/chips.tsx:78-87 — current
{open && (
  <div
    id={panelId}
    role="group"
    aria-label={`Edit ${chip.label}`}
    className={PANEL}
  >
```

Nothing explains where the panel came from. Trigger-anchored elements should
scale from their trigger, not just pop into existence.

## Target

A 150ms entrance from `opacity: 0` + `scale(0.96)`, anchored to the trigger
(the panel is positioned `top-full left-0`, so the origin is `top left`),
implemented with `@starting-style` so the conditional mount keeps working
without JS. Exit stays instant — closing is a dismissal and should snap.

```css
/* target — add to src/app/ui/search.css */
.rota-panel {
  transform-origin: top left;
  transition:
    opacity 150ms var(--ease-out-strong),
    transform 150ms var(--ease-out-strong);
}
@starting-style {
  .rota-panel {
    opacity: 0;
    transform: scale(0.96);
  }
}
```

```tsx
// target — src/app/ui/chips.tsx
const PANEL =
  'rota-panel absolute top-full left-0 z-20 mt-1.5 min-w-52 rounded-lg border border-white/10 bg-[#17171f] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.6)]'
```

## Repo conventions to follow

- Motion classes are `rota-`-prefixed and live in `src/app/ui/search.css`;
  components attach them alongside Tailwind utilities. Exemplar:
  `rota-badge` defined at `src/app/ui/search.css:38`, applied at
  `src/app/ui/results.tsx:161`.
- Easing token `--ease-out-strong` comes from plan 001; if it doesn't exist
  yet, execute plan 001 first.

## Steps

1. In `src/app/ui/search.css`, append the `.rota-panel` rule and the
   `@starting-style` block from Target at the end of the file.
2. In `src/app/ui/chips.tsx:18`, prepend `rota-panel ` to the `PANEL` class
   string (exact result shown in Target).

## Boundaries

- Do NOT touch the panel's markup, open/close state logic, or the
  outside-click/Escape handlers in `ChipsRow`.
- Do NOT animate the exit (no exit-delaying state; unmount stays instant).
- Do NOT add dependencies or a `useEffect`-based mounted flag —
  `@starting-style` only.
- If a step doesn't match the code you find (drift since the commit stamp),
  STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass (chips tests in
  `src/app/ui/chips.test.ts` must not regress).
- **Feel check**: in the running app, create chips (submit “tokyo in feb”),
  then click a chip:
  - The panel grows out of the chip's bottom-left corner, not from center and
    not a pure fade.
  - In DevTools → Animations panel at 10% speed, confirm the scale starts at
    0.96 (a subtle settle, not a zoom from nothing).
  - Clicking the chip again, pressing Escape, or clicking outside closes it
    instantly — no exit animation.
  - Rapidly toggling a chip never leaves the panel stuck half-transparent.
- **Done when**: the panel visibly eases in from the trigger corner in ~150ms
  and all mechanical checks pass.
