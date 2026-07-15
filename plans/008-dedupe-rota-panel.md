# 008 — Remove the duplicate .rota-panel implementation

- **Status**: DONE
- **Commit**: d1147bf (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: MEDIUM
- **Category**: Cohesion / accessibility
- **Estimated scope**: 1 file (`src/app/ui/search.css`), delete ~12 lines

## Problem

`search.css` contains two competing implementations of the chip-editor panel
entrance. The keyframe version:

```css
/* src/app/ui/search.css:46-54 — current (KEEP this one) */
/* Chip editor panels scale in from their trigger, never from center. */
@keyframes rota-panel {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.rota-panel {
  transform-origin: top left;
  animation: rota-panel 0.15s var(--ease-out-strong) both;
}
```

and, at the end of the file, a leftover transition + `@starting-style` version
from an earlier executed plan:

```css
/* src/app/ui/search.css:119-130 — current (DELETE this one) */
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

In normal mode they happen to render identically (a running animation
overrides the transition). But under `prefers-reduced-motion: reduce`, the
media-query override at `search.css:73-79` replaces only the *animation* with
an opacity fade — the later transition block still fires from the
`@starting-style` scale(0.96), so the panel scales in even when the user asked
for reduced motion. The keyframe version is the one already wired into the
reduce block, so it stays.

## Target

The file ends after the `.rota-progress::after` rule (currently line 117).
Lines 119–130 (the second `.rota-panel` block and its `@starting-style` block,
plus the preceding blank line) are gone. No other rule changes.

## Repo conventions to follow

- All motion lives in `src/app/ui/search.css`; this is a pure deletion there.

## Steps

1. In `src/app/ui/search.css`, delete the trailing `.rota-panel { transform-origin: top left; transition: ... }`
   rule and the `@starting-style { .rota-panel { ... } }` block (lines 119–130
   as excerpted above), leaving `.rota-progress::after` as the last rule.

## Boundaries

- Do NOT touch the keyframe `.rota-panel` block (lines 46–54) or the
  reduced-motion media query.
- Do NOT edit `chips.tsx` — the `rota-panel` class stays applied there.
- If the file doesn't contain both blocks as excerpted (drift), STOP and
  report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass;
  `grep -c '\.rota-panel {' src/app/ui/search.css` returns 1 and
  `grep -c '@starting-style' src/app/ui/search.css` returns 0.
- **Feel check**: in the running app, click a chip — the editor panel still
  scales in from its top-left corner in ~150ms. Then in DevTools → Rendering,
  emulate `prefers-reduced-motion: reduce` and reopen the panel: it must FADE
  in with zero scaling (watch at 10% playback in the Animations panel).
- **Done when**: one `.rota-panel` rule remains, and the panel does not scale
  under reduced motion.
