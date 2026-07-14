# 012 — Move the parse progress scanner off `left`

- **Status**: DONE
- **Commit**: d1147bf (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 1 file (`src/app/ui/search.css`), ~6 lines

## Problem

The indeterminate parse progress bar animates `left`, a layout property that
forces layout every frame for the whole time a parse is in flight:

```css
/* src/app/ui/search.css:36-39 — current */
@keyframes rota-bar {
  from { left: -35%; }
  to { left: 100%; }
}
```

```css
/* src/app/ui/search.css:104-117 — current */
.rota-progress {
  position: relative;
  overflow: hidden;
}
.rota-progress::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 35%;
  border-radius: 9999px;
  background: #818cf8;
  animation: rota-bar 1s ease-in-out infinite;
}
```

The element is tiny so nothing visibly drops today, but transform gives the
identical sweep compositor-only, for free.

## Target

Fix the element at `left: -35%` and drive the sweep with `translateX`. The
math: the track is `W` wide; the thumb is `0.35W`. The old sweep went from
`left: -35%` (fully off the left edge) to `left: 100%` (fully off the right),
a travel of `1.35W`. `translateX` percentages are relative to the *element's
own* width (`0.35W`), so the travel is `1.35W / 0.35W = 385.7%` ≈ `386%`.

```css
/* target */
@keyframes rota-bar {
  from { transform: translateX(0); }
  to { transform: translateX(386%); }
}
```

```css
/* target — .rota-progress::after gains `left: -35%`, all else unchanged */
.rota-progress::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -35%;
  width: 35%;
  border-radius: 9999px;
  background: #818cf8;
  animation: rota-bar 1s ease-in-out infinite;
}
```

## Repo conventions to follow

- All motion lives in `src/app/ui/search.css`; both edits are there.
- If plan 010 has landed, the reduced-motion block already sets
  `left: 0; width: 100%; transform: none;` on `.rota-progress::after` — that
  override composes with this change; leave it alone.

## Steps

1. Replace the `rota-bar` keyframes with the `translateX` version from Target.
2. Add `left: -35%;` to the `.rota-progress::after` rule (between `bottom: 0;`
   and `width: 35%;`).

## Boundaries

- Do NOT change the duration (1s), easing (`ease-in-out`), width, or color.
- Do NOT touch `.rota-progress` itself or the reduced-motion block.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass;
  `grep -n 'left' src/app/ui/search.css` shows `left` only as the static
  `left: -35%` / reduce-block `left: 0` values, never inside `@keyframes`.
- **Feel check**: type a query and submit so the thin indigo bar under the
  input animates while parsing:
  - The sweep looks identical to before: enters from the left edge, exits the
    right, ~1s loop, eased.
  - The thumb never rests visible at either edge between loops.
  - In DevTools Performance panel, a short recording during parsing shows the
    animation running without per-frame Layout entries attributable to it.
- **Done when**: the sweep is visually unchanged and driven by `transform`
  only.
