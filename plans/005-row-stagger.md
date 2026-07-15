# 005 — Stagger result row entrances

- **Status**: SUPERSEDED (implemented by hand in the M6 results pivot — 40ms step capped at 240ms, src/app/ui/results.tsx:44-48)
- **Commit**: d1147bf
- **Severity**: LOW
- **Category**: Cohesion
- **Estimated scope**: 1 file (`src/app/ui/results.tsx`), ~5 lines

## Problem

When a source flips from its shimmer placeholder to results, all of its rows
land in the same frame — an everything-at-once group entrance:

```tsx
// src/app/ui/results.tsx:66-84 — current: no index used
{source.options.map((option) => (
  <Row
    key={option.id}
    option={option}
    ...
  />
))}
```

Each `Row`'s root always carries the `rota-row` entrance
(`src/app/ui/results.tsx:130`), so they all animate simultaneously.

## Target

A 35ms per-row `animation-delay`, capped at 5 steps (175ms), passed as an
inline style. Stagger is decorative: it must never block interaction, and a
cap keeps late rows in long lists from waiting.

```tsx
// target — src/app/ui/results.tsx
{source.options.map((option, index) => (
  <Row
    key={option.id}
    option={option}
    delayMs={Math.min(index, 5) * 35}
    ...
  />
))}
```

```tsx
// target — Row signature gains `delayMs: number`, and its root div gets:
<div
  style={{ animationDelay: `${delayMs}ms` }}
  className={`rota-row ...unchanged...`}
>
```

Known tradeoff, accepted: rows appended by a later batch of the same source
get the capped 175ms delay relative to their own mount, which reads as a
slightly later landing — fine. Because `rota-row` uses `both` fill
(`src/app/ui/search.css:36`), delayed rows are invisible (opacity 0) during
their delay rather than flashing unstyled.

Rows already on screen are unaffected: their keys are stable, the animation
has already completed, and changing `animation-delay` on a finished animation
does not restart it.

## Repo conventions to follow

- `Row` already takes flat props (`option`, `travelers`, `isBest`, …); add
  `delayMs` the same way. No context, no CSS-variable indirection.
- Interaction (click-to-expand) must work during the stagger — the delay is
  on the entrance animation only, which it is by construction.

## Steps

1. In `src/app/ui/results.tsx`, change the `source.options.map((option) =>`
   callback to also take `index`, and pass
   `delayMs={Math.min(index, 5) * 35}` to `Row`.
2. Add `delayMs: number` to `Row`'s props and set
   `style={{ animationDelay: `${delayMs}ms` }}` on `Row`'s root `div`
   (the one with `rota-row`, line 129–135).

## Boundaries

- Do NOT touch `search.css` — the delay is per-instance, so it belongs inline.
- Do NOT stagger shimmer placeholders, chips, or anything else.
- Do NOT exceed the 5 × 35ms cap.
- If a step doesn't match the code you find (drift since the commit stamp),
  STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass (`results.test.ts`
  must not regress).
- **Feel check**: run a search and watch a source's results land:
  - Rows cascade top-to-bottom over ~175ms instead of appearing as one block.
  - In DevTools → Animations panel at 10% speed, confirm each row starts
    ~35ms after the previous and rows 6+ share the same delay.
  - Click a still-entering row: it expands immediately (stagger never blocks
    interaction).
- **Done when**: batch entrances cascade with a capped 35ms step and
  interaction during the cascade works.
