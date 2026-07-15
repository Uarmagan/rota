# 013 — Read the FLIP easing from the shared token

- **Status**: DONE
- **Commit**: d1147bf (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`src/app/ui/results.tsx`), ~12 lines

## Problem

The FLIP hook hardcodes the on-screen-movement curve, duplicating the token
defined in CSS:

```tsx
// src/app/ui/results.tsx:139-142 — current
el.animate(
  [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
  { duration: 280, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' },
),
```

```css
/* src/app/ui/search.css:7 — the token it duplicates */
--ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);
```

If the token is ever tuned, the FLIP silently diverges. WAAPI can't reference
CSS custom properties in `easing`, so the value must be read once via
`getComputedStyle`.

## Target

A lazily-initialized module-level reader with the current literal as the
fallback (jsdom's `getComputedStyle` returns an empty string for custom
properties; SSR has no `window`):

```tsx
// target — module scope in src/app/ui/results.tsx, above useFlip()
// WAAPI easing can't reference CSS vars; read --ease-in-out-strong once.
let flipEasing: string | null = null
function getFlipEasing(): string {
  if (flipEasing === null) {
    const token =
      typeof window === 'undefined'
        ? ''
        : getComputedStyle(document.documentElement)
            .getPropertyValue('--ease-in-out-strong')
            .trim()
    flipEasing = token !== '' ? token : 'cubic-bezier(0.77, 0, 0.175, 1)'
  }
  return flipEasing
}
```

```tsx
// target — the animate call
  { duration: 280, easing: getFlipEasing() },
```

## Repo conventions to follow

- `results.tsx` already keeps FLIP machinery as module-level helpers next to
  `useFlip()` (`src/app/ui/results.tsx:116-156`); add the reader there with
  the same comment style (one line stating the non-obvious constraint).
- The existing jsdom guard (`results.tsx:124-127`) means `el.animate` never
  runs in tests, but `getFlipEasing` must still be jsdom-safe — the empty-
  string fallback handles it.

## Steps

1. In `src/app/ui/results.tsx`, add the `flipEasing`/`getFlipEasing`
   definitions from Target at module scope, directly above the
   `// FLIP over layout positions` comment block (line 116).
2. In the `el.animate` options (line 141), replace the literal
   `'cubic-bezier(0.77, 0, 0.175, 1)'` with `getFlipEasing()`.

## Boundaries

- Do NOT change the duration (280), the keyframes, or any FLIP bookkeeping.
- Do NOT touch `search.css` or introduce a React hook/state for this.
- Do NOT cache per-render — the module-level lazy read is the whole design.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass
  (`results.test.ts` runs under jsdom and must not throw from the new reader).
- **Feel check**: run a search where a later batch re-sorts the ranking (any
  multi-source query; rows shuffle as batches land):
  - Rows still glide to their new slots exactly as before — same 280ms, same
    strong in-out curve (fast middle, soft ends). Watch one shuffle at 10%
    playback via DevTools → Animations.
  - Temporarily edit `--ease-in-out-strong` in DevTools to `linear` and
    trigger another re-sort after a page reload: the glide follows the token
    (confirms the read path), then revert.
- **Done when**: no hardcoded cubic-bezier remains in `results.tsx` and
  re-sort motion is unchanged by eye.
