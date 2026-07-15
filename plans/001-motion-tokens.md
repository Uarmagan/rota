# 001 — Introduce motion easing tokens

- **Status**: DONE
- **Commit**: d1147bf
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`src/app/ui/search.css`), ~10 lines

## Problem

Every easing in the app is hand-typed per rule, and the entrance animations ride
the weak built-in CSS `ease-out`, which is too gentle for deliberate UI motion:

```css
/* src/app/ui/search.css:35-38 — current */
.rota-pop { animation: rota-pop 0.25s ease-out both; }
.rota-row { animation: rota-row 0.3s ease-out both; }
.rota-flash { animation: rota-flash 0.9s ease-out 1; }
.rota-badge { animation: rota-badge 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
```

There are no shared curve tokens, so plans 002/003/007 would each have to
hand-type the same cubic-bezier. This plan creates the tokens and migrates the
existing rules onto them.

## Target

```css
/* target — top of src/app/ui/search.css, above the keyframes */
:root {
  --ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

```css
/* target — the four animation rules */
.rota-pop { animation: rota-pop 0.25s var(--ease-out-strong) both; }
.rota-row { animation: rota-row 0.3s var(--ease-out-strong) both; }
.rota-flash { animation: rota-flash 0.9s ease-out 1; }
.rota-badge { animation: rota-badge 0.35s var(--ease-bounce) both; }
```

`rota-flash` keeps plain `ease-out`: it animates a box-shadow pulse, not
movement, and its duration is handled separately in plan 006.

## Repo conventions to follow

- All motion lives in `src/app/ui/search.css` with a `rota-` prefix; tokens go
  at the top of that same file, NOT in `src/app/globals.css` (which is only
  `@import 'tailwindcss';`).
- Do NOT name the token `--ease-out` — Tailwind 4 defines its own `--ease-out`
  theme variable and the name would collide. Use `--ease-out-strong` exactly.

## Steps

1. In `src/app/ui/search.css`, insert the `:root` block from Target between the
   header comment (lines 1–3) and `@keyframes rota-pop`.
2. Replace `ease-out` with `var(--ease-out-strong)` in the `.rota-pop` and
   `.rota-row` rules (lines 35–36).
3. Replace `cubic-bezier(0.34, 1.56, 0.64, 1)` with `var(--ease-bounce)` in the
   `.rota-badge` rule (line 38).

## Boundaries

- Only `src/app/ui/search.css` changes.
- Do NOT change any duration, keyframe definition, or `.rota-flash`.
- Do NOT add tokens to a Tailwind `@theme` block.
- If a step doesn't match the code you find (drift since the commit stamp),
  STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass (no TS/test surface,
  but they must not regress). Do not run `pnpm build`.
- **Feel check**: in the running app, submit a search like
  “tokyo in feb for 2”. Chips should pop in with a noticeably snappier landing
  (fast start, long settle) than before; result rows likewise. The ★ BEST badge
  still overshoots slightly (bounce unchanged).
- **Done when**: `grep -c 'var(--ease-out-strong)' src/app/ui/search.css`
  returns 2, `var(--ease-bounce)` appears once, and no animation rule outside
  `.rota-flash` uses a built-in easing keyword.
