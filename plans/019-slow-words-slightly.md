# 019 — Slow the words-become-chips moment very slightly

- **Status**: DONE
- **Commit**: 1bafed1 (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: LOW (tuning, user feedback on plan 018)
- **Category**: Easing & duration
- **Estimated scope**: 2 files (`src/app/ui/search.css`, `src/app/ui/search-app.tsx`), 2 lines

## Problem

User feedback on the shipped plan-018 moment: keep it, but slow it very
slightly. Current values:

```css
/* src/app/ui/search.css:76 — current */
.rota-send-off { animation: rota-send-off 0.2s var(--ease-out-strong) both; }
```

```tsx
// src/app/ui/search-app.tsx:37 — current
const CHIP_STAGGER_MS = 70
```

## Target

```css
/* target */
.rota-send-off { animation: rota-send-off 0.24s var(--ease-out-strong) both; }
```

```tsx
// target
const CHIP_STAGGER_MS = 85
```

Send-off 200ms → 240ms; cascade step 70ms → 85ms (max total stagger
350ms → 425ms with the existing 6-step cap). Everything else — the 8px lift,
`rota-pop`'s 0.25s duration, the cap, easings — stays exactly as is.

## Repo conventions to follow

- Pure value changes; both lines exist verbatim as excerpted above.

## Steps

1. In `src/app/ui/search.css:76`, change `0.2s` to `0.24s`.
2. In `src/app/ui/search-app.tsx:37`, change `70` to `85`.

## Boundaries

- Do NOT change `rota-pop`, `rota-flash`, `MAX_STAGGER_STEPS`, the keyframes,
  or any easing.
- If either line doesn't match (drift), STOP and report instead of
  improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass.
- **Feel check**: submit a fresh query — the utterance lift reads a touch
  more languid without feeling laggy, and the chip cascade sweeps
  perceptibly rather than flickering. Total cascade must stay under ~450ms.
- **Done when**: both values updated and all tests pass.
