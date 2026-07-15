# 014 — Fade the why-line in

- **Status**: DONE
- **Commit**: d1147bf (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: LOW
- **Category**: Missed opportunity
- **Estimated scope**: 2 files (`src/app/ui/results.tsx`, `src/app/ui/search.css`), ~4 lines

## Problem

The best-match explanation ("why-line") arrives from `/api/explain` seconds
after results settle and mounts with no transition, popping into the expanded
row's details:

```tsx
// src/app/ui/results.tsx:273-277 — current
{expanded && whyLine !== null && (
  <p className="mt-2 max-w-lg leading-relaxed text-neutral-400">
    {whyLine}
  </p>
)}
```

The FLIP hook already animates the rows *below* when this paragraph pushes
them down, so the pop of the paragraph itself is the only rough edge left in
that moment.

## Target

An opacity-only entrance reusing the existing `rota-fade` keyframes
(`src/app/ui/search.css:68-71`):

```css
/* target — add to src/app/ui/search.css, below the .rota-expand rule */
.rota-fade-in { animation: rota-fade 0.3s var(--ease-out-strong) both; }
```

```tsx
// target — results.tsx
{expanded && whyLine !== null && (
  <p className="rota-fade-in mt-2 max-w-lg leading-relaxed text-neutral-400">
    {whyLine}
  </p>
)}
```

No reduced-motion override is needed: the fade is opacity-only, which reduced
motion keeps.

Accepted behavior, not a bug: the fade also plays when a user expands a row
after the why-line has already loaded (the paragraph mounts then) — a content
reveal fading in is fine.

## Repo conventions to follow

- Motion classes are `rota-`-prefixed in `src/app/ui/search.css` and composed
  with Tailwind utilities in the class string — exemplar: `rota-badge` at
  `src/app/ui/results.tsx:224`.
- Reuse the existing `rota-fade` keyframes; do not define new ones.

## Steps

1. In `src/app/ui/search.css`, add the `.rota-fade-in` rule from Target
   directly below the `.rota-expand` rule (currently lines 63–66).
2. In `src/app/ui/results.tsx:274`, prepend `rota-fade-in ` to the why-line
   paragraph's class string (exact result in Target).

## Boundaries

- Do NOT animate height or add layout motion here — the FLIP hook already
  covers displacement; this is opacity only.
- Do NOT touch the why-line fetch/state logic in `search-app.tsx`.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass.
- **Feel check**: run a search, expand the ★ BEST row before the explanation
  arrives, and wait:
  - When the why-line lands, it fades in over ~300ms while rows below glide
    down (FLIP) — no hard pop anywhere.
  - Collapse and re-expand the row: the paragraph fades in with the reveal.
  - Under emulated `prefers-reduced-motion: reduce`, the fade still plays
    (opacity-only is allowed) with no movement.
- **Done when**: the why-line never appears in a single frame, in either
  arrival order.
