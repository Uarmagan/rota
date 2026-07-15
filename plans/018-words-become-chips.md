# 018 — Words become chips: send-off and staggered crystallize

- **Status**: DONE
- **Commit**: 1bafed1 (dirty working tree — plans audit the working tree, not the commit)
- **Severity**: LOW (delight; signature moment)
- **Category**: Missed opportunity
- **Estimated scope**: 3 files (`src/app/ui/search-app.tsx`, `src/app/ui/chips.tsx`, `src/app/ui/search.css`), ~70 lines

## Problem

The product's core magic is language becoming structure: the user types
"tokyo in feb for 2", and the parsed fields appear as chips. Today that
moment reads as two abrupt cuts:

1. **At submit**, the utterance blinks away — `submit()` clears the input
   synchronously before the parse round trip:

```tsx
// src/app/ui/search-app.tsx:95-99 — current
  const submit = async () => {
    const utterance = text.trim()
    if (utterance === '' || parsing) return
    setText('') // the utterance becomes chips; a failed parse restores it
    setParsing(true)
```

2. **When the parse lands**, every affected chip pops at once. `applyIntent`
   maps each non-cleared diff entry to a `ChipAnimation` with no ordering:

```tsx
// src/app/ui/search-app.tsx:63-74 — current
  const applyIntent = (previous: TripIntent, next: TripIntent, nextGap: GapOutcome) => {
    const diff = computeIntentDiff(previous, next)
    setIntent(next)
    setGap(nextGap)
    setAnimations(
      new Map(
        diff
          .filter((change) => change.kind !== 'cleared')
          .map((change) => [change.field, change.kind as ChipAnimation]),
      ),
    )
    setRunId((r) => r + 1)
```

```tsx
// src/app/ui/chips.tsx:14 — current
export type ChipAnimation = 'set' | 'changed'
```

```tsx
// src/app/ui/chips.tsx:446-455 — current
function chipClasses(chip: ChipView, animation: ChipAnimation | undefined): string {
  return [
    CHIP_BASE,
    chip.assumed
      ? 'border-dashed border-amber-400/40 bg-amber-400/[0.06]'
      : 'border-white/10 bg-white/[0.06]',
    animation === 'set' ? 'rota-pop' : '',
    animation === 'changed' ? 'rota-flash' : '',
  ].join(' ')
}
```

A first parse can set six or more fields; they all `rota-pop` in the same
frame, so the transformation registers as a blink, not a sequence. This is
a rare, high-emotion moment (AUDIT category 8) that currently spends none
of its delight budget.

The two beats are separated by real parse latency (the `rota-progress` bar
already shows during it). That gap is honest — do NOT try to bridge it into
one continuous animation.

## Target

**Beat 1 — send-off.** On submit, the utterance lifts out of the input:
translate up 8px + fade to 0 over 200ms with `var(--ease-out-strong)`
(`cubic-bezier(0.23, 1, 0.32, 1)`). The real `<input>` value is still
cleared synchronously (a failed parse must keep restoring it, and the input
element cannot animate its value), so the lift is a transient overlay
`<span>` rendering the utterance text over the input, which unmounts on
`animationend`.

```css
/* target — search.css, next to the other keyframes */
@keyframes rota-send-off {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-8px); }
}
.rota-send-off { animation: rota-send-off 0.2s var(--ease-out-strong) both; }
```

The overlay only mounts when motion is allowed (see `motionOk()` below).
Under reduced motion — and in jsdom, which has no `matchMedia` — the input
clears instantly, exactly as today, and the overlay never exists. This is a
deliberate choice over an opacity-only reduced variant: the overlay is pure
flourish, jsdom never fires `animationend` (a mounted overlay would leak),
and instant clear is the existing behavior.

**Beat 2 — crystallize.** When the parse lands, affected chips pop in one
after another in diff order — the order of the array `computeIntentDiff`
returns (fixed field order: travelers, origin, destination, cabin, dates,
priority, then constraints; see `src/lib/engine/diff.ts:13-27`). Each
non-cleared change gets a delay of `index * 70ms`, capped at 6 steps
(delays 0, 70, 140, 210, 280, 350ms; every chip past the sixth shares
350ms). `rota-pop` runs with `both` fill (`search.css:41`), so a delayed
chip holds `opacity: 0` until its turn — that is the crystallizing effect.
`rota-flash` (changed chips) has no `both` fill, so a delayed changed chip
shows its new value immediately and only its highlight ring staggers —
values never hide behind the cascade.

The `ChipAnimation` type carries the delay:

```tsx
// target — src/app/ui/chips.tsx (replaces the current type alias)
export type ChipAnimationKind = 'set' | 'changed'

export interface ChipAnimation {
  kind: ChipAnimationKind
  delayMs: number
}
```

Delays apply as inline `animation-delay` on the chip button. Chips stay
clickable during the cascade (`opacity: 0` elements still hit-test; the
row's layout is committed immediately).

Direct chip edits (`applyDirectEdit`) reuse `applyIntent` with a one-field
diff, so index 0 → `delayMs: 0` — identical to today with no special-casing.
The send-off overlay is untouched by direct edits (nothing was typed).

**Reduced motion:** the existing reduce override (`search.css:82-88`) maps
`.rota-pop` to `rota-fade 0.15s ease-out both`. The `both` fill keeps
delayed chips invisible until their turn, so the stagger degrades to an
opacity-only cascade — acceptable and intended; do not zero the delays. In
jsdom no animations run at all, so `animation-delay` is inert and chips
render normally.

## Repo conventions to follow

- Easing tokens live in `search.css` `:root` (`--ease-out-strong` etc.);
  keyframes + single-class rules follow the `rota-*` pattern
  (`search.css:11-44`).
- `motionOk()` — jsdom has no `matchMedia`; treat that as reduced motion.
  Copy the exact helper from `src/app/ui/results.tsx:24-30` into
  `search-app.tsx` module scope (duplicating 5 lines beats a new shared
  module; consolidation is out of scope, as plan 017 also decided):

```tsx
// jsdom has no matchMedia; treat that as reduced motion, like results.tsx does.
function motionOk(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
```

- Timing constants at module scope with a sync comment, like
  `results.tsx:21-22` (`const EXPAND_MS = 200 // keep in sync with ...`).
- Comments: one line for the non-obvious constraint only. No `useEffect`
  where derivation or an event handler works — the overlay unmounts via
  `onAnimationEnd`, not a timer effect.

## Steps

1. **`src/app/ui/search.css`** — add the send-off keyframes and class from
   the Target section, placed after the `.rota-fade-in` rule (line 70).
   Do not add `.rota-send-off` to the reduced-motion block: mounting is
   gated on `motionOk()` in JS, so a reduce override would be dead code.

2. **`src/app/ui/chips.tsx`** — replace the `ChipAnimation` type alias
   (line 14) with the `ChipAnimationKind` + `ChipAnimation` interface from
   the Target section. Update `chipClasses` to match on `kind`:

```tsx
function chipClasses(chip: ChipView, animation: ChipAnimation | undefined): string {
  return [
    CHIP_BASE,
    chip.assumed
      ? 'border-dashed border-amber-400/40 bg-amber-400/[0.06]'
      : 'border-white/10 bg-white/[0.06]',
    animation?.kind === 'set' ? 'rota-pop' : '',
    animation?.kind === 'changed' ? 'rota-flash' : '',
  ].join(' ')
}
```

3. **`src/app/ui/chips.tsx`** — in `ChipsRow`'s `chips.map`, read the
   animation once and put the delay on the button (currently
   `chips.tsx:63-77`):

```tsx
      {chips.map((chip) => {
        const panelId = `chip-editor-${chip.field.replaceAll('.', '-')}`
        const open = openField === chip.field
        const animation = animations.get(chip.field)
        return (
          <span key={`${chip.field}:${runId}`} className="relative">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpenField(open ? null : chip.field)}
              style={animation && { animationDelay: `${animation.delayMs}ms` }}
              className={`${chipClasses(chip, animation)} rota-press cursor-pointer hover:border-white/25`}
            >
```

   (`style` accepts `undefined`; `animation && {...}` keeps chips without an
   animation entry style-free.)

4. **`src/app/ui/search-app.tsx`** — add module-scope constants and the
   `motionOk()` helper (above `SearchApp`, after the `WhyLine` interface):

```tsx
const CHIP_STAGGER_MS = 70
const MAX_STAGGER_STEPS = 6 // cap so a many-field first parse never drags
const SEND_OFF_MS = 200 // keep in sync with .rota-send-off in search.css
```

   (`SEND_OFF_MS` is documentation-by-constant only if the executor finds a
   use; if nothing references it, omit it rather than leave a dead constant.
   The CSS literal `0.2s` is the source of truth.)

5. **`src/app/ui/search-app.tsx`** — stagger in `applyIntent`. Replace the
   `setAnimations` call (lines 67-73) with:

```tsx
    const changed = diff.filter((change) => change.kind !== 'cleared')
    setAnimations(
      new Map(
        changed.map((change, index) => [
          change.field,
          {
            kind: change.kind as ChipAnimationKind,
            delayMs: Math.min(index, MAX_STAGGER_STEPS - 1) * CHIP_STAGGER_MS,
          },
        ]),
      ),
    )
```

   Update the import on line 24 to pull the kind type:
   `import { ChipsRow, PromptChip, type ChipAnimation, type ChipAnimationKind } from './chips'`
   (drop `ChipAnimation` from the import if, after the change, only the
   `useState` generic uses it — it still does, so keep both).

6. **`src/app/ui/search-app.tsx`** — send-off state. Add next to the other
   state hooks:

```tsx
  const [sendOff, setSendOff] = useState<string | null>(null)
```

   In `submit()`, right after `setText('')`:

```tsx
    if (motionOk()) setSendOff(utterance)
```

   In the failed-parse branch (currently lines 109-113), clear the overlay
   before restoring the text, so an instant failure (e.g. immediate network
   error) never double-exposes the utterance:

```tsx
    if (!result.ok) {
      setSendOff(null)
      setError(result.message)
      setText(utterance)
      return
    }
```

7. **`src/app/ui/search-app.tsx`** — render the overlay. Wrap the input in
   a relative span inside the existing form (currently lines 247-257) —
   this is the one permitted markup change:

```tsx
            <span className="relative min-w-0 flex-1">
              <input
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={
                  hasIntent
                    ? 'refine: “actually business class, nonstop if possible”'
                    : 'describe your trip: “tokyo in feb for 2”'
                }
                className="w-full bg-transparent py-3.5 text-[15px] text-neutral-100 placeholder-neutral-600 outline-none"
              />
              {sendOff !== null && (
                <span
                  aria-hidden
                  onAnimationEnd={() => setSendOff(null)}
                  className="rota-send-off pointer-events-none absolute inset-0 flex items-center truncate text-[15px] text-neutral-100 select-none"
                >
                  {sendOff}
                </span>
              )}
            </span>
```

   The wrapper takes over the input's flex slot (`flex-1` + `min-w-0`
   replaces the layout role of the input's `w-full`, which stays for width
   inside the wrapper). `inset-0` + `flex items-center` vertically centers
   the overlay text to match the input's `py-3.5` text position; `truncate`
   handles long utterances. `pointer-events-none` keeps the (now empty,
   focused) input immediately typable. No `key` is needed: the `parsing`
   guard in `submit()` blocks resubmission until the parse resolves, which
   is seconds after the 200ms overlay has unmounted.

## Boundaries

- Do NOT touch `rota-pop`, `rota-flash`, `rota-progress`, the reduced-motion
  block, or any other existing rule in `search.css` — additions only.
- Do NOT change `applyDirectEdit`, `computeIntentDiff`, `startSearch`, or
  the parse/abort plumbing (`parseRun`, `parseAbortRef`).
- Do NOT touch `PromptChip`, the editor panels, or anything in
  `results.tsx`.
- Do NOT add a `useEffect` or timer for the overlay — `onAnimationEnd` plus
  the JS mount gate is the whole lifecycle.
- Do NOT add new dependencies.
- Existing tests (`src/app/ui/search-app.test.ts`, `src/app/ui/chips.test.ts`)
  must keep passing. If one fails, STOP and report the failure — do not
  rewrite the test.
- If a step doesn't match the code you find (drift since the commit stamp),
  STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` and `pnpm test` pass. jsdom has no
  `matchMedia`, so `motionOk()` is false in tests: the overlay never mounts
  (the rejected-parse test's `input.value` restoration is untouched), and
  `animation-delay` styles are inert. `chips.test.ts` passes
  `animations: new Map()`, which typechecks unchanged against the new
  interface.
- **Feel check** (DevTools → Animations panel at 10% playback for the
  slow-motion items):
  - Type "tokyo in feb for 2" and submit: the words lift up ~8px and fade
    out of the input in one gesture — no blink. The progress bar then runs;
    when the parse lands, chips crystallize left-to-right in diff order,
    each ~70ms after the previous, none appearing before its turn.
  - The two beats do not visually overlap: the overlay is gone well before
    the first chip pops (parse latency separates them — that gap is
    intentional).
  - Submit a refinement ("actually business class, nonstop if possible"):
    only the affected chips animate; a changed chip shows its new value
    instantly and its flash ring sweeps in order.
  - Click a chip and apply a direct edit (e.g. travelers): single chip,
    zero delay, no send-off overlay — indistinguishable from today.
  - During the cascade, click a not-yet-visible chip's position: nothing
    breaks (the row layout is already committed; a hit either opens that
    chip's editor or misses harmlessly).
  - Force a parse failure (e.g. stop the dev API or submit gibberish that
    422s): the utterance is restored into the input, no ghost overlay
    remains.
  - Emulate `prefers-reduced-motion: reduce` (Rendering panel): submit
    clears the input instantly (no overlay, no translate); chips fade in
    with the existing gentle fade, still one after another (opacity-only
    stagger — intended).
- **Done when**: the utterance visibly lifts out on submit, chips
  crystallize sequentially in diff order with a ≤350ms total stagger,
  direct edits and failed parses behave exactly as before, and typecheck +
  all existing tests pass.
