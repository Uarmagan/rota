# 003 — Animate result row expand/collapse

- **Status**: SUPERSEDED (implemented by hand in the M6 results pivot — grid-rows transition at src/app/ui/results.tsx:232-241)
- **Commit**: d1147bf
- **Severity**: MEDIUM
- **Category**: Missed opportunity / interruptibility
- **Estimated scope**: 2 files (`src/app/ui/results.tsx`, `src/app/ui/search.css`), ~25 lines

Depends on plan 001 (uses `--ease-out-strong`).

## Problem

Result row details expand/collapse by conditional mount. The content teleports
in and everything below it jumps, on a row users toggle constantly:

```tsx
// src/app/ui/results.tsx:168-199 — current
{expanded && (
  <div
    id={detailsId}
    role="region"
    aria-label={`Details for ${option.id}`}
    className="px-3 pb-3 text-xs text-neutral-400"
  >
    ...
  </div>
)}
```

Because it's a mount/unmount, it also can't be made interruptible with
keyframes — rapid toggling must retarget mid-flight, which requires a CSS
transition on an always-mounted element.

## Target

The grid-rows accordion pattern: an always-mounted wrapper transitions
`grid-template-rows` between `0fr` and `1fr`. CSS transitions retarget from
the current value, so spamming the toggle reverses smoothly instead of
restarting. (`grid-template-rows` is a layout property — acceptable here
because the accordion pattern has no transform/opacity equivalent and the
content is small; do not "optimize" it to height tweening.)

```css
/* target — add to src/app/ui/search.css */
.rota-expand {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 200ms var(--ease-out-strong);
}
.rota-expand[data-expanded='true'] {
  grid-template-rows: 1fr;
}
.rota-expand > div {
  overflow: hidden;
  min-height: 0;
}
```

```tsx
// target — src/app/ui/results.tsx, replacing the `{expanded && (...)}` block
<div className="rota-expand" data-expanded={expanded}>
  <div>
    <div
      id={detailsId}
      role="region"
      aria-label={`Details for ${option.id}`}
      className="px-3 pb-3 text-xs text-neutral-400"
      inert={!expanded || undefined}
      aria-hidden={!expanded}
    >
      ... (existing children, unchanged)
    </div>
  </div>
</div>
```

`inert` + `aria-hidden` keep the collapsed content out of the tab order and
the accessibility tree, preserving the previous conditional-mount semantics.
React 19 supports the boolean `inert` prop; `inert={!expanded || undefined}`
keeps it off the DOM when expanded.

## Repo conventions to follow

- Motion classes are `rota-`-prefixed in `src/app/ui/search.css`; the
  `data-expanded` attribute selector style matches how state reaches CSS
  elsewhere in the repo (Tailwind arbitrary variants are also used, but keep
  this rule in search.css with the other motion).
- Keep `aria-expanded`/`aria-controls` on the toggle button
  (`src/app/ui/results.tsx:138-139`) exactly as they are — `aria-controls`
  still points at `detailsId`.

## Steps

1. In `src/app/ui/search.css`, append the three `.rota-expand` rules from
   Target.
2. In `src/app/ui/results.tsx`, replace the `{expanded && (` ... `)}` block
   (lines 168–199) with the always-mounted structure from Target. The inner
   content (`<ol>`, the two `<p>`s, the `whyLine` paragraph) is unchanged.
3. Check `src/app/ui/results.test.ts` for assertions that the details region
   is absent when collapsed (e.g. `queryByRole('region')` returning null).
   `aria-hidden` elements are already excluded from Testing Library role
   queries, so most tests should pass untouched; if one asserts on raw DOM
   presence, update it to assert `aria-hidden`/`inert` instead. Report any
   test change you make.

## Boundaries

- Do NOT change the `expandedId` state model in `Results` or the reset
  `useEffect` at `src/app/ui/results.tsx:35-44`.
- Do NOT animate with keyframes, JS-measured heights, or `max-height` hacks.
- Do NOT add dependencies.
- If a step doesn't match the code you find (drift since the commit stamp),
  STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass, including
  `src/app/ui/results.test.ts` and `src/app/ui/search-app.test.ts`.
- **Feel check**: run a search, then click a result row:
  - Details unfold in ~200ms; rows below slide down instead of jumping.
  - Click the row rapidly: the panel reverses mid-motion smoothly — it never
    snaps shut and replays from zero.
  - With the row collapsed, Tab through the page: nothing inside the details
    (no hidden focus stops) is reachable.
  - Expand a row, then submit a new search: no crash, no stuck-open panel
    (the reset effect still clears `expandedId`).
- **Done when**: expand/collapse is animated, interruptible, and the collapsed
  content is untabbable and hidden from assistive tech.
