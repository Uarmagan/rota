# 004 — Respect prefers-reduced-motion

- **Status**: SUPERSEDED (a reduce block landed by hand at src/app/ui/search.css:73-91; remaining gaps are covered by plan 010)
- **Commit**: d1147bf
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (`src/app/ui/search.css`), ~30 lines

No hard dependency, but written assuming plans 001–003 have landed (it
references `.rota-panel` and `.rota-expand`; if those classes don't exist yet,
skip their rules and note it in the report).

## Problem

`src/app/ui/search.css` has no `prefers-reduced-motion` handling at all. Every
animation runs regardless of the OS setting, including movement:

```css
/* src/app/ui/search.css:5-13 — current: scale + translate movement */
@keyframes rota-pop {
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes rota-row {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
```

plus the infinite `rota-shimmer` background sweep (line 48) and the
`rota-bar` progress sweep (line 63).

## Target

Reduced motion means fewer and gentler animations, not zero: keep opacity and
color feedback, drop positional/scale movement, and calm the infinite sweeps
to a gentle opacity pulse (loading state must stay indicated).

```css
/* target — add at the END of src/app/ui/search.css */
@keyframes rota-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes rota-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .rota-pop, .rota-row, .rota-badge {
    animation: rota-fade 0.2s ease both;
  }
  /* rota-flash stays: box-shadow color pulse, no movement */
  .rota-shimmer {
    background: rgba(255, 255, 255, 0.08);
    animation: rota-pulse 1.4s ease-in-out infinite;
  }
  .rota-progress::after {
    left: 0;
    width: 100%;
    animation: rota-pulse 1s ease-in-out infinite;
  }
  .rota-panel {
    transition: opacity 150ms ease;
  }
  @starting-style {
    .rota-panel { transform: none; }
  }
  .rota-expand {
    transition: none;
  }
}
```

Notes on intent, so the executor doesn't "improve" it:

- `.rota-flash` is deliberately NOT overridden — it's a color pulse that
  indicates a changed chip; reduced motion keeps comprehension aids.
- The shimmer/progress overrides replace horizontal movement with an opacity
  pulse so loading is still visible.
- `.rota-expand { transition: none; }` makes expand/collapse instant — a
  layout-size change is movement.

## Repo conventions to follow

- All motion lives in `src/app/ui/search.css`; append there, keep the `rota-`
  prefix for new keyframes.
- Keyframe names so far are single-purpose nouns (`rota-pop`, `rota-bar`);
  `rota-fade` and `rota-pulse` follow that.

## Steps

1. Append the two keyframes and the `@media (prefers-reduced-motion: reduce)`
   block from Target to the end of `src/app/ui/search.css`.
2. If `.rota-panel` or `.rota-expand` don't exist in the file (plans 002/003
   not executed yet), omit those specific rules and say so in your report.

## Boundaries

- Only `src/app/ui/search.css` changes — no TSX, no `useReducedMotion` hooks.
- Do NOT remove or weaken any animation outside the media query.
- Do NOT set `animation: none` on the loading indicators — they must keep
  pulsing.
- If a step doesn't match the code you find (drift since the commit stamp),
  STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass.
- **Feel check**: in DevTools → Rendering panel, set
  “Emulate CSS media feature prefers-reduced-motion” to `reduce`, then:
  - Submit a search: chips and rows fade in with no scale/translate movement.
  - While sources stream, shimmer blocks pulse in place (no left-to-right
    sweep); the parse progress bar pulses as a full-width bar (no scanner).
  - Edit a chip to trigger `rota-flash`: the ring pulse still appears.
  - Open a chip editor: it fades in without scaling; expanding a result row is
    instant.
  - Switch emulation back to `no-preference` and confirm all original motion
    returns.
- **Done when**: with reduced motion emulated, nothing on screen translates or
  scales, while loading and changed-state feedback remain visible.
