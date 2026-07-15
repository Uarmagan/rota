# 009 — Fix the press/hover transition conflict and finish option press feedback

- **Status**: DONE
- **Commit**: d1147bf (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: MEDIUM
- **Category**: Easing & duration / physicality
- **Estimated scope**: 2 files (`src/app/ui/search.css`, `src/app/ui/chips.tsx`), ~8 lines

## Problem

Two related issues around `.rota-press`.

**(a) Chip hover color snaps.** The chip trigger button carries both
`rota-press` and Tailwind's `transition-colors`:

```tsx
// src/app/ui/chips.tsx:73 — current
className={`${chipClasses(chip, animations.get(chip.field))} rota-press cursor-pointer transition-colors hover:border-white/25`}
```

```css
/* src/app/ui/search.css:56-61 — current */
.rota-press {
  transition: transform 160ms var(--ease-out-strong);
}
.rota-press:active {
  transform: scale(0.97);
}
```

Tailwind 4 emits utilities inside `@layer utilities`; `search.css` is
unlayered, and unlayered author styles beat layered ones regardless of order.
The `transition` shorthand in `.rota-press` therefore resets every
transition sub-property, killing `transition-colors` — the chip's hover
border-color change snaps instead of easing.

**(b) Editor option buttons never got press feedback.** Chips compress on
press; the option buttons inside the editor panel don't:

```tsx
// src/app/ui/chips.tsx:20-21 — current
const OPTION =
  'flex w-full items-baseline justify-between rounded px-2 py-1.5 text-left text-xs text-neutral-100 hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none'
```

## Target

```css
/* target — src/app/ui/search.css, replacing the .rota-press rule only */
.rota-press {
  transition:
    transform 160ms var(--ease-out-strong),
    border-color 150ms ease,
    background-color 150ms ease;
}
```

(`.rota-press:active` is unchanged.)

```tsx
// target — chips.tsx:73: transition-colors removed, rota-press now owns colors
className={`${chipClasses(chip, animations.get(chip.field))} rota-press cursor-pointer hover:border-white/25`}
```

```tsx
// target — chips.tsx:20-21: rota-press prepended
const OPTION =
  'rota-press flex w-full items-baseline justify-between rounded px-2 py-1.5 text-left text-xs text-neutral-100 hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none'
```

## Repo conventions to follow

- Motion classes are `rota-`-prefixed in `src/app/ui/search.css`, composed
  with Tailwind utilities in class strings — exemplar: `rota-pop` in
  `PromptChip` at `src/app/ui/chips.tsx:98`.
- `--ease-out-strong` already exists at `src/app/ui/search.css:6`.

## Steps

1. In `src/app/ui/search.css`, replace the `.rota-press` rule's transition
   with the three-property version from Target.
2. In `src/app/ui/chips.tsx:73`, delete ` transition-colors` from the chip
   button class string (exact result in Target).
3. In `src/app/ui/chips.tsx:20-21`, prepend `rota-press ` to the `OPTION`
   constant (exact result in Target).

## Boundaries

- Do NOT add press feedback to result rows, Apply/Clear buttons, or inputs.
- Do NOT change `.rota-press:active`, the reduced-motion overrides, or
  `chipClasses`.
- Do NOT scale below 0.95 or above 0.98.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass (`chips.test.ts` must
  not regress).
- **Feel check**: in the running app with chips visible:
  - Hover a chip slowly: the border-color EASES in over ~150ms (this is the
    regression being fixed — before, it snapped).
  - Press and hold a chip: subtle compression to 0.97; springs back on
    release.
  - Open a chip editor, press an option row: same compression, and its hover
    background still eases.
  - Emulate `prefers-reduced-motion: reduce`: pressing compresses nothing
    (the existing reduce override still wins).
- **Done when**: hover colors ease again, chips and editor options both
  compress on press, and all tests pass.
