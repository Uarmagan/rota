# 010 — Close the reduced-motion gaps (loading sweeps, chip flash)

- **Status**: DONE
- **Commit**: d1147bf (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (`src/app/ui/search.css`), ~20 lines

## Problem

A `prefers-reduced-motion` block exists (`src/app/ui/search.css:73-91`) but
has two gaps:

**(a) The infinite sweeps keep moving.** Neither loading indicator is covered,
so under `reduce` the shimmer keeps sweeping horizontally and the parse bar
keeps scanning:

```css
/* src/app/ui/search.css:93-102 — current, uncovered */
.rota-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.05) 25%,
    rgba(255, 255, 255, 0.11) 50%,
    rgba(255, 255, 255, 0.05) 75%
  );
  background-size: 200% 100%;
  animation: rota-shimmer 1.4s linear infinite;
}
```

```css
/* src/app/ui/search.css:108-117 — current, uncovered */
.rota-progress::after {
  /* ... */
  animation: rota-bar 1s ease-in-out infinite;
}
```

**(b) The changed-chip flash is nuked.** Reduced motion means fewer and
gentler animations, not zero — keep opacity/color feedback, drop movement.
`rota-flash` is a pure box-shadow color pulse with no movement, and it is the
only signal that a refinement changed an existing chip, yet:

```css
/* src/app/ui/search.css:80-82 — current */
  .rota-flash {
    animation: none;
  }
```

## Target

Loading must stay *indicated* under reduce (a gentle in-place opacity pulse),
and the flash must play.

```css
/* target — new keyframes, add directly below the existing rota-fade keyframes
   (src/app/ui/search.css:68-71) */
@keyframes rota-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
```

Inside the existing `@media (prefers-reduced-motion: reduce)` block:

1. Delete the `.rota-flash { animation: none; }` rule entirely (the flash
   then plays its normal definition).
2. Add these rules at the end of the block:

```css
  .rota-shimmer {
    background: rgba(255, 255, 255, 0.08);
    animation: rota-pulse 1.4s ease-in-out infinite;
  }
  .rota-progress::after {
    left: 0;
    width: 100%;
    transform: none;
    animation: rota-pulse 1s ease-in-out infinite;
  }
```

Notes so the executor doesn't "improve" it:

- The `.rota-shimmer` override replaces the gradient with a flat wash so the
  frozen `background-position` doesn't show a static stripe.
- `left: 0; width: 100%; transform: none;` turns the scanner into a
  full-width bar that pulses in place. `transform: none` is there so this
  plan is order-independent with plan 012 (which may move the scanner onto
  `translateX`).
- Do NOT touch the other rules already in the reduce block
  (`.rota-pop/.rota-row/.rota-badge/.rota-panel`, `.rota-expand`,
  `.rota-press`).

## Repo conventions to follow

- Keyframes are `rota-`-prefixed nouns in `src/app/ui/search.css`
  (`rota-fade` at line 68 is the exemplar); the reduce block already exists at
  lines 73–91 — extend it, don't create a second one.

## Steps

1. Add the `rota-pulse` keyframes below `rota-fade`.
2. In the `@media (prefers-reduced-motion: reduce)` block, delete the
   `.rota-flash { animation: none; }` rule.
3. In the same block, append the `.rota-shimmer` and `.rota-progress::after`
   overrides from Target.

## Boundaries

- Only `src/app/ui/search.css` changes; only the locations named above.
- Do NOT weaken or remove any animation outside the media query.
- Do NOT set `animation: none` on the loading indicators — they must keep
  pulsing.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass.
- **Feel check**: DevTools → Rendering → emulate
  `prefers-reduced-motion: reduce`:
  - Submit a search: shimmer placeholders pulse in place — no left-to-right
    sweep; while parsing, the progress track pulses as one full-width bar —
    no scanner.
  - Refine an existing chip (e.g. “actually business class”): the indigo
    ring flash still appears on the changed chip.
  - Switch back to `no-preference`: gradient shimmer sweep and scanner bar
    return.
- **Done when**: under reduce, nothing translates or sweeps, loading is still
  visibly active, and the changed-chip flash plays in both modes.
