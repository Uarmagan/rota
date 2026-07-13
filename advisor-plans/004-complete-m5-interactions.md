# Plan 004: Make every intent chip editable and top results openable

> **Executor instructions**: Complete Plans 001 and 003 first. Follow every step and
> command. Update `advisor-plans/README.md` when done. Stop on any STOP condition.
>
> **Dirty-snapshot/drift check**:
>
> ```sh
> test -f src/app/ui/search-app.tsx
> git diff --stat 32d5f8f..HEAD -- src/lib/engine/edit.ts src/lib/engine/edit.test.ts src/app/ui/search-app.tsx src/app/ui/chips.tsx src/app/ui/results.tsx src/app/ui/format.ts src/app/ui/*.test.*
> ```
>
> Baseline hashes before prerequisite plans: `search-app.tsx` `9c06cefb...`,
> `chips.tsx` `6e38e675...`, `results.tsx` `0a9afc38...`. Plan 003 is expected to
> change `search-app.tsx`; compare its final diff with Plan 003 before continuing. Any
> unrelated semantic drift is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `advisor-plans/001-add-m5-behavior-tests.md`,
  `advisor-plans/003-prevent-stale-parse-overwrite.md`
- **Category**: bug
- **Planned at**: commit `32d5f8f`, 2026-07-13, plus dirty M5 snapshot

## Why this matters

Rota's trust thesis requires every interpreted fact to be correctable without retyping,
and the 60-second demo ends by opening the top result. The current UI makes only origin
interactive and renders every result as an inert `div`. This plan completes those
contractual interactions while retaining the Palette design, direct-intent editing, and
client-owned engine computation.

## Current state

- `PRD.md:45-52` requires editable travelers, route, cabin, dates, and constraints.
- `CONTEXT.md:22-25` defines a Chip as a direct TripIntent editor that skips the parser.
- `src/app/ui/chips.tsx:27-42` gives only the origin chip an `OriginChip`; all others are
  spans.
- `src/app/ui/search-app.tsx:99-103` has a one-off origin mutation rather than a general
  direct-edit path.
- `src/app/ui/results.tsx:104-146` renders an inert row and the why-line directly below.
- `docs/adr/0007-thin-search-stream-and-prose-fallback.md` requires ranking/facts to
  remain client-side; do not move them to a route.

Current chip branching (`src/app/ui/chips.tsx:27-42`):

```tsx
{chips.map((chip) =>
  chip.field === 'origin' ? (
    <OriginChip ... />
  ) : (
    <span className={chipClasses(chip, animations.get(chip.field))}>
      <ChipBody chip={chip} />
    </span>
  ),
)}
```

Current result shell (`src/app/ui/results.tsx:104-111`):

```tsx
<div
  className={`rota-row border-b border-white/5 py-3 pl-3 transition-colors ...`}
>
```

Schema semantics to preserve:

- The browser holds a normalized intent. Origin, cabin, and travelers must remain filled
  and visible after direct edits even though their shared schema types are nullable at
  the pre-normalization boundary.
- Travelers is an integer 1-9.
- Origin confirmation sets `assumed: false`; destination has no assumed flag.
- Exact dates have equal earliest/latest; flexible dates have an ordered window.
- Nonstop is `required | preferred | null`; boolean constraints are true/false/null.
- A direct edit is a new transition, so previous transient `unhandled` is cleared by
  recomputing `checkGaps(next, null)`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm exec vitest run src/lib/engine/edit.test.ts src/app/ui/search-app.test.tsx src/app/ui/chips.test.tsx src/app/ui/results.test.tsx src/lib/import-boundaries.test.ts` | all pass |
| Full tests | `pnpm test` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:

- `src/lib/engine/edit.ts` and `edit.test.ts` (new pure update helper)
- `src/app/ui/chips.tsx` and `chips.test.tsx` (new test)
- `src/app/ui/results.tsx` and `results.test.tsx` (new test)
- `src/app/ui/search-app.tsx` and `search-app.test.tsx`
- `src/app/ui/search.css` only for editor/expanded-row states that cannot be expressed
  with the existing Tailwind utilities

**Out of scope**:

- Schema changes, new constraints, exploratory destinations, metro airports, or round
  trips.
- A component library or new dependency.
- Server-side ranking/facts, explanation retry policy, or result booking links.
- Visual redesign, responsive re-layout, or animation timing changes unrelated to the
  new interactions.

## Git workflow

- Branch: `advisor/004-complete-m5-interactions`
- Prefer two logical commits: `Add direct intent chip editors`, then
  `Make result rows expandable`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Centralize schema-valid direct intent edits

Create a pure engine helper in `src/lib/engine/edit.ts` that takes a full `TripIntent`
and a discriminated `IntentEdit`, then returns a new full intent. Keep every edit variant
typed to its field; do not accept `unknown` or use `any`/casts to bypass the schema.
This is deterministic state-transition logic and belongs in the engine, not `src/app`.

Support setting every displayed field. Allow Clear only for destination, dates,
priority, and constraints. Do not allow origin, cabin, or travelers to become null in
normalized browser state: those are assumed/defaulted fields whose visible chips are a
product invariant. Date edits must enforce exact equality and flexible ordering before
returning. Place edits accept registry-derived values; origin sets `assumed: false`.

**Verify**: pure tests cover set/change/clear for each field family plus invalid date
ordering and traveler bounds.

### Step 2: Replace one-off origin chips with accessible field editors

Refactor `ChipsRow` so every chip is a button with `aria-expanded` and an editor panel.
Keep at most one panel open. Preserve existing labels, assumed styling, and diff
animations. Use existing/native controls:

- Travelers: select 1-9; no Clear.
- Origin/destination: supported-place buttons.
- Origin has no Clear; destination has Clear.
- Cabin: the four schema cabins; no Clear.
- Dates: exact/flexible selector and date inputs; disable Apply until valid.
- Priority: cheapest/fastest plus Clear.
- Nonstop: required/preferred plus Clear.
- Arrive-by/depart-after: `input type="time"` plus Clear.
- Avoid-red-eye/late-arrival: avoid/fine plus Clear.

Escape and outside click close without editing; keyboard focus must reach every option.
Do not invent modal/chat UI. Emit a typed edit to the parent only on an explicit option
selection or Apply.

**Verify**: chip tests prove each editor opens by role, emits the correct typed edit,
supports Clear only where semantically removable, and exposes assumed-origin
confirmation.

### Step 3: Use one direct-transition path in SearchApp

Replace `pickOrigin` with a general `applyDirectEdit` that:

1. Uses the pure helper to create the next full intent.
2. Invalidates pending parse work using Plan 003's helper.
3. Recomputes `checkGaps(next, null)` so transient notices do not persist.
4. Calls the existing `applyIntent` for diff animation and re-search behavior.

If destination or dates are cleared, search stops and the existing prompting state
appears. Do not call `/api/parse` for any chip edit.

**Verify**: component tests edit at least one field from each editor family, assert the
parse endpoint was not called, and assert a valid edit re-searches. Cover clearing dates
and clearing a previous `ready_with_notice`.

### Step 4: Make result rows expand without navigation

In `Results`, own one `expandedId: string | null`. Render each row's summary as a real
button with `aria-expanded`/`aria-controls`; clicking or pressing Enter/Space toggles an
inline details region. The region displays only existing deterministic data:

- ordered segment route and local departure/arrival timestamps,
- cabin and fictional program,
- party miles/fees already computed by engine pricing,
- why-this-result line when the row is the current best and matching copy exists.

Do not invent booking URLs, airline claims, or new computed numbers. When a re-rank
means the expanded row is no longer present, close it. Keep the best badge live.

**Verify**: result tests cover mouse/keyboard toggle, one-open-at-a-time behavior,
deterministic details, best badge movement on rerender, and why-line binding only to the
matching best option.

### Step 5: Run the demo-contract regression set

Extend the SearchApp test through: lazy query -> assumed origin -> direct cabin or
constraint edit -> re-search -> top result expansion -> matching why line. This remains
fully mocked/network-free and complements, not replaces, the later live M6 walkthrough.

Run focused tests, full tests, typecheck, and build.

## Test plan

- `src/lib/engine/edit.test.ts`: every edit variant, normalization invariants, clearable
  versus non-clearable fields, date validity, and exact changed-field behavior.
- `chips.test.tsx`: accessible open/close, keyboard selection, typed edit payloads, and
  only semantically valid Clear actions.
- `results.test.tsx`: toggle semantics, deterministic details, one-open-at-a-time, best
  rebadging, and why-line binding.
- `search-app.test.tsx`: no parser call on edits, gap recomputation, re-search/blocking,
  transient notice clearing, and the full deterministic demo-contract journey.

Model Vitest style on existing colocated tests and DOM setup on Plan 001. Avoid visual
snapshots and class-string assertions.

## Done criteria

- [ ] Every non-null TripIntent field rendered as a chip can be changed directly.
- [ ] Destination, dates, priority, and constraints can be cleared without parser use;
  origin, cabin, and travelers remain visibly normalized.
- [ ] Direct edits create schema-valid full intents, recompute gaps with null unhandled,
  animate diffs, and search only when searchable.
- [ ] Result summaries are keyboard-accessible buttons with inline expansion.
- [ ] The top result's matching why line appears in its details when available.
- [ ] No schema, API, provider, LLM, or dependency change occurred.
- [ ] Focused tests, `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- [ ] The index status row is updated.

## STOP conditions

- Plan 003's parse-invalidation seam is absent or must be duplicated.
- A required editor cannot be expressed without changing TripIntent schema semantics.
- Product direction is needed for result details beyond existing engine facts.
- The implementation requires a component library or server-side ranking.
- The interaction cannot meet basic keyboard behavior without a broader accessibility
  design decision; report the exact blocker.

## Maintenance notes

The typed edit union becomes the only supported direct-chip mutation seam. Future fields
must add a helper case, editor, and tests together. Reviewers should reject editors that
build partially valid intents or call the parser. A later design-system plan may replace
the panel primitives without changing edit semantics.
