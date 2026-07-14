# 006 — Shorten the changed-chip flash

- **Status**: SUPERSEDED by plan 011 (same fix, line numbers refreshed after the M6 changes)
- **Commit**: d1147bf
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 1 file (`src/app/ui/search.css`), 1 line

## Problem

Chips flash a ring when a refinement changes them — a frequent event (every
parsed utterance or direct edit that modifies a field). The flash runs 900ms,
triple the sub-300ms budget for UI motion:

```css
/* src/app/ui/search.css:15-18, 37 — current */
@keyframes rota-flash {
  0%, 100% { box-shadow: 0 0 0 0 transparent; }
  30% { box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.6); }
}
.rota-flash { animation: rota-flash 0.9s ease-out 1; }
```

Honest uncertainty: the file header (`src/app/ui/search.css:1-3`) documents
that visible state change is the point of this demo, so the length may be a
deliberate noticeability choice. This plan shortens it while keeping the peak
early and bright; the feel check decides whether it lands.

## Target

```css
/* target */
.rota-flash { animation: rota-flash 0.6s ease-out 1; }
```

The keyframe percentages stay unchanged — at 0.6s the ring now peaks at 180ms
and fades over the remaining 420ms. Still over the strict budget, but this is
an attention pulse (state indication), not an entrance; 600ms keeps it
noticeable without lingering.

## Repo conventions to follow

- One-line duration change in `src/app/ui/search.css`; nothing else moves.

## Steps

1. In `src/app/ui/search.css:37`, change `0.9s` to `0.6s`.

## Boundaries

- Do NOT change the keyframe percentages, color, ring width, or easing.
- Do NOT touch the trigger logic (`chipClasses` in `src/app/ui/chips.tsx:446`).
- If a step doesn't match the code you find (drift since the commit stamp),
  STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass.
- **Feel check** (this is the real gate): submit “tokyo in feb”, then refine
  with “actually business class”:
  - The changed chip's ring is still unmissable while reading the chip row.
  - It no longer feels like it's hanging around after your eye has moved on.
  - Fire several refinements back-to-back: flashes on successive chips read
    as distinct events, not one continuous glow.
  - If 600ms feels too abrupt to whoever reviews this, 700ms is the acceptable
    upper bound — do not go back to 900ms.
- **Done when**: the flash duration is 0.6s (or 0.7s after an explicit
  feel-check override, noted in the report) and the ring still draws the eye.
