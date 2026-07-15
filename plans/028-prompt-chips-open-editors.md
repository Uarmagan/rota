# Plan 028: Make prompt chips fulfill their one-tap editor contract

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Preserve all unrelated working-tree changes. If anything in the
> "STOP conditions" section occurs, stop and report rather than improvising.
> When done, update only plan 028's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `rg -n "PromptChip|Where to\?|When\?|gap\.question" src/app/ui/chips.tsx src/app/ui/search-app.tsx src/app/ui/search-app.test.ts`
> The expected starting state is a noninteractive `PromptChip`, a separate
> question sentence, and tests that assert prompt text without activating it.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: none
- **Category**: product contract, interaction, accessibility
- **Planned at**: dirty working tree, 2026-07-15

## Why this matters

Rota's trust promise is that every interpretation becomes visible structure
that can be corrected in one tap. The domain glossary makes that promise
specific for missing fields: a prompt chip sits where the filled chip will sit,
the chip itself is the question, and tapping it opens the same editor.

The current UI contradicts that contract at the exact moment a user needs to
repair an incomplete interpretation. `Where to?` and `When?` look like pulsing
chips but are inert spans. The interface then adds a separate question sentence
beside them, turning visible structure back into an instruction banner.

This is also an accessibility failure under the current Web Interface
Guidelines: an element styled as interactive must be a real, keyboard-operable
control with a visible focus state.

## Current state

- `CONTEXT.md` defines a prompt chip as the unfilled form of an ordinary chip,
  says tapping it opens the same editor, requires all missing-field prompt chips
  to render together, and forbids a separate question sentence.
- `PRD.md` says every interpretation is correctable in one tap and that chips
  are the structured fallback to natural language.
- `src/app/ui/chips.tsx` renders `PromptChip` as a `<span>` with pulse styling.
  It has no button semantics, keyboard behavior, focus state, or editor.
- `src/app/ui/search-app.tsx` renders prompt chips in a separate row outside
  `ChipsRow`, where the actual editor ownership and `openField` state live.
- `When?` renders only after destination is filled, so two missing blockers do
  not appear together.
- `gap.question` or fallback instruction copy renders beside the prompt chip,
  even though the product language says the chip itself is the question.
- Existing tests prove only that `Where to?` / `When?` text appears after a
  direct clear or incomplete parse. They do not prove either control opens an
  editor or repairs the intent.

## Target behavior

1. Missing destination renders an interactive `Where to?` prompt chip in the
   canonical destination slot. Activating it opens the existing airport editor.
2. Missing dates renders an interactive `When?` prompt chip in the canonical
   dates slot. Activating it opens the existing date editor.
3. When both fields are missing, both prompt chips render at once. `Where to?`
   is the first blocker and receives the stronger emphasis; `When?` remains
   visible but quieter.
4. Selecting a value uses the existing direct-edit path. It does not call the
   parser. Search starts only after all blocking fields are filled.
5. The separate question/instruction sentence is removed. The single natural-
   language input remains available as the alternate way to resolve a gap.
6. Prompt triggers are semantic controls with descriptive accessible names,
   keyboard activation, and the same visible focus treatment as filled chips.
7. Desktop keeps the existing popover editors and mobile keeps the existing
   drawer editors. Do not create a second destination or date editor.

## Implementation shape

Keep prompt behavior inside `ChipsRow`, because it already owns editor open
state and renders the canonical chip sequence.

1. Extend the presentation model in `src/app/ui/format.ts` so an unfilled
   destination or date can be represented as a prompt variant without changing
   `TripIntent`. Prompt state is presentation, not schema or engine state.
2. In `src/app/ui/chips.tsx`, derive the ordered row from the filled chips plus
   prompt variants for null destination/dates. Reuse `AirportChip` and
   `DateChip`; both editors already accept null current values.
3. Give prompt variants dashed styling distinct from filled chips. Only the
   first missing blocker may pulse or receive the stronger indigo emphasis.
   Honor reduced motion; do not add a new infinite animation.
4. Make `ChipBody` render prompt copy without an empty uppercase field label.
   Accessible names should be explicit: `Choose destination` and
   `Choose travel dates` are preferred over exposing only `Where to?` and
   `When?` to assistive technology.
5. Remove the standalone inert `PromptChip` implementation and remove the
   separate missing-field row from `src/app/ui/search-app.tsx`. Keep gap state
   for search gating and parser outcomes; only its duplicate visual question
   copy disappears.

## Scope

**In scope**:

- `src/app/ui/format.ts`
- `src/app/ui/chips.tsx`
- `src/app/ui/search-app.tsx`
- `src/app/ui/search-app.test.ts`
- Administrative exception: update only plan 028's row in `plans/README.md`

**Out of scope**:

- Changing `TripIntent`, `GapOutcome`, parser output, engine gap policy, or API
  contracts
- Rewriting the initial input, its terminal glyph, or its submit affordance
- Adding a new date picker, airport picker, modal, or question banner
- Changing the domain glossary or creating an ADR; the decision is already
  explicit and this implementation is easy to reverse
- Refactoring unrelated chip editors, animation scheduling, results, or prose

## Test plan

Add interaction-level coverage in `src/app/ui/search-app.test.ts`:

1. Parse an intent with destination and dates both null. Assert that
   `Choose destination` and `Choose travel dates` controls both render.
2. Activate `Choose destination`, verify the existing airport editor opens,
   select a supported airport, and verify no new `/api/parse` request occurs.
3. Activate `Choose travel dates`, verify the existing date editor opens,
   select/apply a date, and verify search begins only after both blockers are
   resolved.
4. Clear destination and dates from a searchable intent, then repeat the same
   activations to cover the direct-clear recovery path.
5. Assert the duplicate `gap.question` / `Add dates to search` sentence is not
   rendered.
6. Preserve the existing assertions that no search starts while either blocker
   remains null.

Do not test Tailwind class strings as the primary proof. Test roles, accessible
names, editor visibility, direct-edit requests, and search gating.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Desktop browser: produce an intent missing destination and dates; activate
  both prompt chips with mouse and keyboard and verify popovers open.
- 375px browser: repeat and verify the existing drawers open without horizontal
  overflow or the virtual keyboard covering the active editor.
- Reduced motion: verify the first blocker does not pulse indefinitely and both
  prompts remain visible.
- `git diff --check -- plans/028-prompt-chips-open-editors.md plans/README.md src/app/ui/format.ts src/app/ui/chips.tsx src/app/ui/search-app.tsx src/app/ui/search-app.test.ts`

## Done criteria

- [ ] Missing destination and dates render as real controls in the chip row.
- [ ] Both prompt chips render simultaneously when both fields are null.
- [ ] Only the first blocker receives stronger emphasis.
- [ ] Each prompt opens the existing field editor on desktop and mobile.
- [ ] Direct prompt edits do not call the parser.
- [ ] Search remains blocked until destination and dates are both present.
- [ ] No duplicate question sentence renders beside the chips.
- [ ] Keyboard focus and activation are visible and functional.
- [ ] Typecheck, tests, build, desktop, mobile, and reduced-motion checks pass.

## STOP conditions

Stop and report if:

- `CONTEXT.md` no longer defines prompt chips as interactive editors or no
  longer requires all missing blockers to appear together.
- The existing airport or date editor cannot accept a null current value
  without changing schema, engine, or API contracts.
- Repairing a prompt would require a parser call instead of the existing
  direct-edit path.
- The task starts requiring a new modal/editor implementation rather than reuse.
- Any verification fails twice after a reasonable scoped correction.

