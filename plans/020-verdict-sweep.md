# 020 — Verdict sweep: draw the best row's edge when the search settles

- **Status**: DONE (visual form superseded same-day: the left-border sweep became a soft ring bloom around the neutral winner slab when the best-row highlight was redesigned — trigger/delay plumbing unchanged; see `.rota-best`/`.rota-verdict::after` in search.css)
- **Commit**: 1bafed1 (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: LOW (delight; finale punctuation)
- **Category**: Missed opportunity
- **Estimated scope**: 2 files (`src/app/ui/results.tsx`, `src/app/ui/search.css`), ~35 lines

## Problem

When the last source finishes (`streaming` flips true → false), the ranking is
final — but nothing marks the moment. The best row already shows its static
indigo tint during streaming, so the finale is silent; the why-line fading in
~a second later is the only punctuation.

Design notes that shape the fix:

- The best row's `border-l-indigo-400` is already visible mid-stream, so a
  sweep in the same color would be invisible. The sweep must be a **brighter,
  glowing pass** (indigo-300 `#a5b4fc`) drawn top-to-bottom over the existing
  border, which then fades out, leaving the static border as the resting
  state.
- The final batch often re-ranks the list: rows glide for `FLIP_MS` (280ms)
  and the crown already waits for the glide via `badgeDelayMs` (plan 017).
  The sweep must inherit the same delay so it never draws on a row still
  gliding into the top slot — crown lands and edge draws together.

Current code the fix touches:

```tsx
// src/app/ui/results.tsx:158-171 — current (Row's root div)
  return (
    <div
      ref={ref}
      style={{ animationDelay: `${enterDelayMs}ms` }}
      className={`rota-row border-b border-white/5 transition-colors hover:bg-white/[0.03] ${
        isBest
          ? 'border-l-2 border-l-indigo-400 bg-indigo-400/[0.04]'
          : 'border-l-2 border-l-transparent'
      }`}
    >
```

(Line numbers may drift a few lines; match on the code.)

## Target

**Trigger.** In `Results`, detect the settle transition with the same
idempotent render-time-ref pattern as `crown` (StrictMode-safe: guarded
writes only):

```tsx
// target — inside Results, directly after the crown ref block
  // The verdict fires once, when the stream settles with a winner.
  const verdict = useRef<{ streamed: boolean; id: string | null }>({
    streamed: false,
    id: null,
  })
  if (streaming) verdict.current = { streamed: true, id: null }
  else if (verdict.current.streamed && bestId !== null) {
    verdict.current = { streamed: false, id: bestId }
  }
```

`verdict.current.id` stays set after firing (the animation runs once and its
`both` fill ends at opacity 0); a new search sets `streaming` and resets it.

**Row wiring.** Pass one new prop and set one CSS variable:

```tsx
// target — the Row invocation gains:
          verdict={verdict.current.id === option.id}
```

```tsx
// target — Row props gain `verdict: boolean` (after `badgeDelayMs`), and the
// root div becomes:
    <div
      ref={ref}
      style={
        {
          animationDelay: `${enterDelayMs}ms`,
          '--rota-verdict-delay': `${badgeDelayMs}ms`,
        } as React.CSSProperties
      }
      className={`rota-row relative border-b border-white/5 transition-colors hover:bg-white/[0.03] ${
        verdict ? 'rota-verdict' : ''
      } ${
        isBest
          ? 'border-l-2 border-l-indigo-400 bg-indigo-400/[0.04]'
          : 'border-l-2 border-l-transparent'
      }`}
    >
```

The custom property is needed because the sweep lives on a pseudo-element,
which inline `animationDelay` cannot reach (and the root's `animationDelay`
already belongs to the `rota-row` entrance). The cast to `React.CSSProperties`
is required for the custom property key. `relative` anchors the pseudo-element
(added unconditionally — rows are not `absolute`-positioned children of
anything, so it is inert otherwise). Import `React` types only if not already
available (`import type { CSSProperties } from 'react'` and
`as CSSProperties` is equally acceptable — pick whichever matches the file's
existing import style; it currently imports named hooks from 'react').

**CSS.** Add to `src/app/ui/search.css`, after the `.rota-fade-in` rule:

```css
/* Verdict: a bright pass draws down the winner's edge, then hands back to
   the static border. */
@keyframes rota-verdict {
  0% { transform: scaleY(0); opacity: 1; }
  60% { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(1); opacity: 0; }
}
.rota-verdict::after {
  content: '';
  position: absolute;
  left: -2px;
  top: 0;
  bottom: 0;
  width: 2px;
  transform-origin: top;
  background: #a5b4fc;
  box-shadow: 0 0 8px rgba(165, 180, 252, 0.7);
  pointer-events: none;
  animation: rota-verdict 0.55s var(--ease-out-strong)
    var(--rota-verdict-delay, 0ms) both;
}
```

`left: -2px` sits the 2px bar exactly on top of the row's `border-l-2`
(absolutely-positioned elements offset from the padding box, i.e. inside the
border). 550ms total = draw to 100% height by 330ms, fade over the remaining
220ms — over the 300ms UI budget, justified: this is a rare, once-per-search
finale. The `both` fill keeps it at opacity 0 afterward.

**Reduced motion.** The sweep is scaleY movement and pure flourish (the crown
and tint already communicate the winner) — skip it entirely. Add to the END
of the existing `@media (prefers-reduced-motion: reduce)` block:

```css
  .rota-verdict::after {
    animation: none;
    opacity: 0;
  }
```

## Repo conventions to follow

- Render-time-ref idempotency exemplar: the `crown` block in `results.tsx`
  (guarded writes; StrictMode double-render safe). Do not convert to state
  or an effect.
- `rota-*` keyframes + classes in `search.css`; tokens from `:root`
  (`--ease-out-strong` exists).
- Comments: one line for the non-obvious constraint only.

## Steps

1. Add the `rota-verdict` keyframes and `.rota-verdict::after` rule to
   `search.css` after `.rota-fade-in`, and the reduce override at the end of
   the existing `prefers-reduced-motion` block.
2. Add the `verdict` ref block in `Results` directly after the `crown` block.
3. Pass `verdict={verdict.current.id === option.id}` to `Row`.
4. Add `verdict: boolean` to `Row`'s props; update the root div's `style`
   (add the `--rota-verdict-delay` custom property) and `className` (add
   `relative` and the conditional `rota-verdict`) as shown in Target.
5. Run `pnpm typecheck` and `pnpm test`.

## Boundaries

- Do NOT change the static best-row tint classes, the crown/badge logic,
  `useFlip`, `toggleExpanded`, or the why-line.
- Do NOT trigger the sweep on re-ranks mid-stream — only on the
  streaming→settled transition with a non-null best.
- Do NOT add effects, timers, or state for the trigger — the guarded ref is
  the whole mechanism.
- Existing tests must keep passing; if one fails, STOP and report — do not
  rewrite it.
- If a step doesn't match the code you find (drift), STOP and report instead
  of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass.
- **Feel check** (DevTools → Animations at 10% playback for the first item):
  - Run a search and wait for the last source to finish: a bright indigo
    line draws down the best row's left edge and dissolves back into the
    static border — once, exactly when the "N/N sources" counter completes.
  - If the final batch re-ranks: rows glide, the crown lands, and the sweep
    draws with the same delay — never on a row mid-glide.
  - Mid-stream re-ranks produce NO sweep; a new search produces a fresh
    sweep on its own settle.
  - The why-line then fades in after the sweep — finale reads: settle →
    sweep → explanation.
  - Under `prefers-reduced-motion: reduce`: no sweep at all; tint and crown
    fade as before.
- **Done when**: the sweep fires once per settled search on the winner,
  respects the crown delay, is absent under reduce, and all tests pass.
