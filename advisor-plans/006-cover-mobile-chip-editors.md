# Plan 006: Add durable mobile date and time chip-editor coverage

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a STOP condition occurs,
> stop and report it instead of broadening the production change. When done, update the
> status row for this plan in `advisor-plans/README.md` unless a reviewer says they own
> the index.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 43abf42..HEAD -- src/app/ui/chips.test.ts src/app/ui/chips.tsx src/app/ui/hooks/use-mobile.ts
> shasum -a 256 src/app/ui/chips.test.ts src/app/ui/chips.tsx src/app/ui/hooks/use-mobile.ts
> ```
>
> At planning time the hashes were:
>
> - `src/app/ui/chips.test.ts`: `28969d63324fdd55c4e667892a09a8b926020cf153406ae429c901db4a44c7ef`
> - `src/app/ui/chips.tsx`: `ef2bf719c7bafd977b7e9950b51cbdcea4cd042629fa035fe9ed09318a022e52`
> - `src/app/ui/hooks/use-mobile.ts`: `9d4ce54ade58d13f51aaade98ffff60599dddd9b2c838d112737e28160cc7f11`
>
> If an in-scope production file changed, compare the live implementation with the
> excerpts below. A semantic mismatch is a STOP condition; do not rewrite the plan from
> memory.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `43abf42`, 2026-07-15

## Why this matters

The chip layer renders different Base UI primitive trees at mobile widths: date and time
editors use Drawers below 768px but Popovers on desktop. Current automated tests cover
the mobile Airport Drawer and only the desktop Date and Time paths. Mobile-specific
layout and interaction defects were found during the implementation walkthrough, so the
remaining Drawer branches need regression coverage that survives future primitive
updates.

This plan adds tests only. If the tests reveal a production defect, report it separately
instead of quietly fixing source code under a coverage plan.

## Current state

- `src/app/ui/hooks/use-mobile.ts:5-25` owns the 768px breakpoint and reads
  `window.innerWidth` in its effect.
- `src/app/ui/chips.tsx:263-276` renders the Date editor in a Drawer on mobile. Its unique
  description is `Pick one day or a flexible travel window.`
- `src/app/ui/chips.tsx:461-473` renders each Time editor in a Drawer on mobile. Its
  unique description is `Use local airport time.`
- `src/app/ui/chips.tsx:160-163` closes the active editor after any completed `IntentEdit`.
- `src/app/ui/chips.test.ts:74-98` is the existing mobile pattern: set `innerWidth` to
  375 before `setup()`, wait for the mobile trigger, and interact within the named
  dialog.
- `src/app/ui/chips.test.ts:127-188` covers exact and flexible dates on desktop only.
- `src/app/ui/chips.test.ts:190-214` covers Apply and Clear for time on desktop only.
- The test file uses jsdom, Testing Library, `userEvent`, and the shared `setup()` helper.
  Match this style: single quotes, no semicolons, two-space indentation, explicit
  accessibility-role queries, and direct `IntentEdit` assertions.

Responsive production branches (`src/app/ui/chips.tsx:263-285`):

```tsx
if (isMobile) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerTrigger className={triggerClass}>{trigger}</DrawerTrigger>
      <DrawerContent aria-label="Edit Dates" className="dark border-white/10 bg-[#17171f]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Edit Dates</DrawerTitle>
          <DrawerDescription>Pick one day or a flexible travel window.</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pt-3 pb-5">
          <DateEditorContent current={current} onEdit={onEdit} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
```

Existing viewport technique (`src/app/ui/chips.test.ts:74-79`):

```ts
Object.defineProperty(window, 'innerWidth', {
  value: 375,
  configurable: true,
})
const { onEdit } = setup()
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline | `pnpm exec vitest run src/app/ui/chips.test.ts` | existing 10 tests pass |
| Focused tests | `pnpm exec vitest run src/app/ui/chips.test.ts` | all tests pass, including at least 3 new mobile cases |
| Full tests | `pnpm test` | all repository tests pass |
| Typecheck | `pnpm typecheck` | exit 0, no errors |
| Build | `pnpm build` | production build completes |
| Diff check | `git diff --check` | no output, exit 0 |

There is no lint script. Do not invent one. Do not run `pnpm eval`; it is networked and
paid, and this plan does not touch parser behavior.

## Suggested executor toolkit

- Use the installed `@Browser` / `browser:control-in-app-browser` capability for the
  required 375px smoke test after the automated gates.
- Read `.agents/skills/improve/references/plan-template.md` only if plan-execution
  conventions are unclear; repository code remains the source of truth.

## Scope

**In scope** (the only source file to modify):

- `src/app/ui/chips.test.ts`

**Index-only update after completion**:

- `advisor-plans/README.md`

**Out of scope** (do not touch):

- `src/app/ui/chips.tsx`, `src/app/ui/hooks/use-mobile.ts`, or any primitive component.
- SearchApp behavior, parser/eval code, schemas, styles, dependencies, or lockfiles.
- Snapshot tests, a new browser-test framework, or production-only test hooks.
- Desktop behavior already covered by the existing date and time cases.

## Git workflow

- Branch: `advisor/006-mobile-chip-editor-tests` when executed independently. If an
  orchestrator provides an isolated worktree/branch, use that instead.
- Commit subject: `Cover mobile chip editors`.
- Keep the implementation commit limited to the test file. Update the plan index in the
  same commit only when instructed to maintain it.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Establish and simplify the mobile test harness

1. Run the focused baseline command before editing; all 10 existing cases must pass.
2. Add a local `setViewportWidth(width: number)` helper in `chips.test.ts` that performs
   the existing configurable `window.innerWidth` definition.
3. Use the helper in `afterEach` to restore 1024px and in the existing mobile Airport
   test to set 375px. Do not add a new `matchMedia` implementation: this component suite
   already exercises the real `useIsMobile` fallback successfully.

**Verify**:

```sh
pnpm exec vitest run src/app/ui/chips.test.ts
```

Expected: the original 10 tests still pass with no React `act` warnings.

### Step 2: Cover the mobile Date Drawer

Add two distinct tests. In both, call `setViewportWidth(375)` before `setup()` and use
`within(drawer)` for every control inside the editor.

1. **Exact date**:
   - Open the Dates chip and find the `Edit Dates` dialog.
   - Assert the Drawer-only description `Pick one day or a flexible travel window.` is
     present. This prevents the test from accidentally exercising the desktop Popover.
   - Select February 8, 2027.
   - Assert the exact `dates` edit (`earliest` and `latest` both `2027-02-08`,
     `flexibility: 'exact'`) and wait for the dialog to close.
2. **Flexible range**:
   - Open the mobile Date Drawer and choose Flexible.
   - Select February 10 and assert no edit has fired yet.
   - Select February 14 and assert the ordered flexible `dates` edit.
   - Wait for the dialog to close after the complete range commits.

Do not combine the cases: a failure should identify exact selection versus range
completion directly.

**Verify**: focused suite passes with 12 tests total at this point.

### Step 3: Cover the mobile Time Drawer

Add one test for the Arrive-by editor at 375px:

1. Open `Arrive by 17:00` and find `Edit Arrive by`.
2. Assert the Drawer-only description `Use local airport time.` is present.
3. Change the labeled time input to `19:30`; assert no edit occurs before Apply.
4. Click Apply; assert `{ field: 'constraints.arriveBy', value: '19:30' }` and wait for
   the dialog to close.
5. Reopen the editor, click Clear, assert the nullable edit, and wait for closure again.

**Verify**: focused suite passes with 13 tests total and no leaked dialog between cases.

### Step 4: Run repository and Browser gates

Run the full tests, typecheck, build, and diff check from the command table. Then start
the local app with `pnpm dev` and use `@Browser` at a 375px viewport to smoke-test:

- Dates opens as a bottom Drawer, Exact applies on one day, and Flexible waits for both
  endpoints.
- Arrive-by opens as a bottom Drawer, typed text does not apply early, and Apply closes
  it.
- Browser console contains no errors during these interactions.

If obtaining an intent requires credentials unavailable to the executor, STOP and
report the Browser gate as blocked; do not add bypass code or commit secrets.

Finally inspect:

```sh
git status --short
git diff -- src/app/ui/chips.test.ts advisor-plans/README.md
```

Expected: no production source files are modified.

## Test plan

- Preserve all 10 existing cases.
- Add three mobile cases: exact date, flexible date range, and time Apply/Clear.
- In every new case, prove the Drawer branch with its unique description, assert the
  exact `IntentEdit`, and assert editor closure.
- Use the existing mobile Airport test as the structural pattern and the desktop Date
  and Time cases as the expected-edit source.
- Do not assert implementation classes, portals, or Base UI internal data attributes.

## Done criteria

- [ ] `chips.test.ts` contains at least three explicit mobile Date/Time regression cases.
- [ ] Each mobile case distinguishes Drawer from Popover using accessible content.
- [ ] Exact date, flexible range completion, time Apply, time Clear, and editor closure
      are asserted.
- [ ] `pnpm exec vitest run src/app/ui/chips.test.ts` passes all 13 tests.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- [ ] `git diff --check` exits 0.
- [ ] The 375px `@Browser` smoke test passes with no console errors, or is explicitly
      reported blocked due to unavailable credentials.
- [ ] No production source, dependency, parser, or schema file changed.
- [ ] The status row in `advisor-plans/README.md` is updated.

## STOP conditions

Stop and report instead of improvising if:

- The focused baseline does not pass before edits.
- The production excerpts or baseline hashes changed semantically since `43abf42`.
- A new test exposes a real Date, Time, Drawer, or `useIsMobile` defect; this plan does
  not authorize production fixes.
- The coverage requires mocking Base UI internals or adding production test hooks.
- A verification command fails twice after correcting test-only mistakes.
- Any implementation appears to require touching a file outside the in-scope list.

## Maintenance notes

Any future editor that switches primitive families at the mobile breakpoint should gain
a mobile test beside its desktop interaction case. If `useIsMobile` later moves away
from the `innerWidth` fallback, update the shared test viewport helper deliberately and
keep one assertion that proves the Drawer branch rather than merely changing viewport
state. Reviewers should reject tests coupled to Base UI implementation classes; roles,
labels, descriptions, emitted edits, and closure are the stable contract.
