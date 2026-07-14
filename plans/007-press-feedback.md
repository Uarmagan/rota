# 007 — Add press feedback to chips and editor options

- **Status**: SUPERSEDED (chips got press feedback by hand; the remainder — option buttons and the hover-transition conflict — is plan 009)
- **Commit**: d1147bf
- **Severity**: LOW
- **Category**: Physicality & origin
- **Estimated scope**: 2 files (`src/app/ui/chips.tsx`, `src/app/ui/search.css`), ~10 lines

Depends on plan 001 (uses `--ease-out-strong`).

## Problem

Chips and their editor option buttons are pressed constantly but give no press
feedback — only hover color:

```tsx
// src/app/ui/chips.tsx:73 — current (chip trigger button)
className={`${chipClasses(chip, animations.get(chip.field))} cursor-pointer transition-colors hover:border-white/25`}
```

```tsx
// src/app/ui/chips.tsx:20-21 — current (OPTION, the editor list buttons)
const OPTION =
  'flex w-full items-baseline justify-between rounded px-2 py-1.5 text-left text-xs text-neutral-100 hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none'
```

## Target

`scale(0.97)` on `:active` with a 160ms strong ease-out. One CSS class carries
both the press transform and the color transitions, because the chip's
current `transition-colors` utility and a new transform transition would
otherwise fight over the `transition` property.

```css
/* target — add to src/app/ui/search.css */
.rota-press {
  transition:
    transform 160ms var(--ease-out-strong),
    border-color 150ms ease,
    background-color 150ms ease;
}
.rota-press:active {
  transform: scale(0.97);
}
```

```tsx
// target — chip trigger button (chips.tsx:73): transition-colors replaced by rota-press
className={`${chipClasses(chip, animations.get(chip.field))} rota-press cursor-pointer hover:border-white/25`}
```

```tsx
// target — OPTION (chips.tsx:20-21): rota-press prepended
const OPTION =
  'rota-press flex w-full items-baseline justify-between rounded px-2 py-1.5 text-left text-xs text-neutral-100 hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none'
```

Deliberately out of scope: result rows (full-width list rows look wrong
scaling), the Apply/Clear buttons (rare, low value), and the `hidden`
disclosure rows.

## Repo conventions to follow

- Motion classes are `rota-`-prefixed in `src/app/ui/search.css`, composed
  with Tailwind utilities in the class string — exemplar: `rota-pop` inside
  `PromptChip` at `src/app/ui/chips.tsx:98`.
- `--ease-out-strong` comes from plan 001; execute that first if missing.

## Steps

1. In `src/app/ui/search.css`, append the two `.rota-press` rules from Target.
2. In `src/app/ui/chips.tsx:73`, replace `transition-colors` with `rota-press`
   in the chip button's class string (exact result in Target).
3. In `src/app/ui/chips.tsx:20-21`, prepend `rota-press ` to the `OPTION`
   constant (exact result in Target).

## Boundaries

- Do NOT add press feedback to result rows, Apply/Clear buttons, or inputs.
- Do NOT change `chipClasses` or any animation logic.
- Do NOT scale below 0.95 or above 0.98.
- If a step doesn't match the code you find (drift since the commit stamp),
  STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass (`chips.test.ts` must
  not regress).
- **Feel check**: in the running app with chips visible:
  - Press and hold a chip: it compresses subtly (barely-there, not a bounce),
    and springs back on release.
  - Hovering a chip still transitions its border color smoothly (the
    `transition-colors` removal must not make hover snap).
  - Open a chip editor and press an option: same compression on the option
    row.
  - Chip pop/flash animations still play on parse (the new class must not
    interfere with `rota-pop`/`rota-flash` — they're `animation`, this is
    `transition`, so they compose).
- **Done when**: chips and editor options compress to 0.97 on press, hover
  color transitions still ease, and all tests pass.
