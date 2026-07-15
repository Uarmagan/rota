# Plan 027: Make the roadmap identify M7 as the current milestone

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update only this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 008d4db -- ROADMAP.md`
> Drift from plans 025 and 026 is expected in parser corpus counts. Any other
> milestone-status change must be reconciled against the current checked boxes
> before proceeding.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/026-metamorphic-parser-families.md`
- **Category**: docs
- **Planned at**: commit `008d4db`, 2026-07-14

## Why this matters

The roadmap summary says M6 is current and that its UI relayout follows later,
while the detailed M6 section marks the relayout and milestone complete. Rota's
repo instructions tell every contributor to use the roadmap as milestone truth,
so this contradiction can cause duplicate work and misdirected execution. The
summary should point to M7 demo hardening and its remaining gates.

## Current state

- `ROADMAP.md:29-31` currently says:

  ```md
  - **Current:** M6 Google-Flights pivot. Registry, cash pricing, real airline
    identities, and geometry-derived durations are implemented; the UI relayout follows
    separately.
  ```

- `ROADMAP.md:210-224` marks M6 done, including merged-list UI, airline rows,
  persistent simulated-data disclosure, and stream status.
- `ROADMAP.md:226-234` lists M7 as demo hardening, with parser challenge work
  complete and the browser walkthrough, hostile UI pass, and README still open.
- Plans 025 and 026 may change parser fixture/case counts. Use their final
  deterministic count output; do not preserve stale hardcoded totals.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Find status markers | `rg -n "\*\*Current:\*\*|\*\*Status:\*\*|M7" ROADMAP.md` | one current milestone, M7 |
| Check stale phrase | `rg -n "UI relayout follows|Current:\*\* M6" ROADMAP.md` | no output |
| Diff hygiene | `git diff --check -- ROADMAP.md plans/README.md` | no output |
| Repo verification | `pnpm test` | all tests pass |

## Scope

**In scope**:

- `ROADMAP.md`
- Administrative exception: update only plan 027's row in `plans/README.md`

**Out of scope**:

- Marking any incomplete M7 checkbox complete
- Changing PRD, architecture, implementation, or historical milestone decisions
- Rewriting historical test counts that are explicitly tied to an earlier
  milestone completion snapshot
- Publishing, committing, or pushing unrelated dirty files

## Git workflow

- Branch: `advisor/027-current-roadmap-status`
- Use one docs-only commit such as `Mark M7 as the current milestone`.
- Do not push or open a PR unless explicitly requested.

## Steps

### Step 1: Reconcile the summary with detailed milestone state

Replace the stale M6 current-status item with an M7 item. Summarize only facts
shown by the detailed M7 checklist:

- strict parser challenge work is complete;
- end-to-end demo walkthrough remains;
- hostile-input behavior through the real UI remains;
- README/run instructions remain.

Do not claim M7 is done or invent dates/results.

**Verify**: `rg -n "\*\*Current:\*\*" ROADMAP.md` returns exactly one line and
that line names M7.

### Step 2: Reconcile parser corpus counts after dependent plans

If plans 025 and 026 changed the corpus, update summary and M7 wording to report
canonical fixture and expanded eval-case counts separately. Obtain values from
the committed expansion helper or its tests; never count entries manually.

Keep the original historical 25-fixture live result labeled as historical. Do
not claim a new live pass unless the corresponding eval command actually ran.

**Verify**: documented current counts match the deterministic helper/test output.

### Step 3: Run docs and repo checks

Review the final diff for status truth and run the full offline suite because the
roadmap is the repository's milestone ledger.

**Verify**:

- `rg -n "UI relayout follows|Current:\*\* M6" ROADMAP.md` → no output
- `git diff --check -- ROADMAP.md plans/README.md` → no output
- `pnpm test` → all tests pass

## Test plan

- No new automated test is required for a docs-only correction.
- Use `rg` as the machine-checkable contradiction gate.
- Run the existing full offline suite to ensure the final plan sequence leaves
  the repo green.

## Done criteria

- [ ] The summary names M7 as the sole current milestone.
- [ ] No text says the completed M6 UI relayout still follows separately.
- [ ] M7's remaining work matches its unchecked boxes exactly.
- [ ] Parser fixture/case counts are accurate after plans 025 and 026.
- [ ] No incomplete milestone item is marked complete.
- [ ] `git diff --check` returns no output.
- [ ] `pnpm test` passes.
- [ ] Plan 027's status row is updated in `plans/README.md`.

## STOP conditions

Stop and report if:

- Plan 026 is incomplete or its fixture/case counts cannot be obtained
  deterministically.
- The M6 detailed section no longer says Done.
- Someone completed additional M7 work but left no verification evidence.
- Correcting the summary appears to require changing implementation or PRD scope.
- Any verification fails twice after a reasonable correction.

## Maintenance notes

- Update the top summary whenever a milestone's detailed status changes; it is
  the fast path read by both humans and agents.
- Historical test counts should stay labeled by milestone/date, while current
  corpus counts should come from code.
