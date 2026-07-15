# Rota

Conversational flight search on simulated availability. Read these before changing
anything:

- [PRD.md](PRD.md) — product scope and principles (what and why)
- [ARCHITECTURE.md](ARCHITECTURE.md) — module boundaries and the intent pipeline
  (where and how)
- [ROADMAP.md](ROADMAP.md) — milestone order, status, and open decisions (when).
  Keep it updated as work lands.

## Non-negotiable invariants

- `src/lib/engine` is pure TS: imports only zod/schema/engine. LLM packages only under
  `src/lib/parser` and `src/lib/prose`. Enforced by `src/lib/import-boundaries.test.ts`.
- The parser re-emits the COMPLETE TripIntent (never patches). IntentDiff is computed
  in the engine, never LLM-emitted.
- The parser may translate user-provided trip meaning into visible chip values such as
  dates, times, and party size, but it must never invent them. No result number or
  prose claim shown to a user may originate from an LLM.
- AI SDK is pinned to the v6 line (`ai@^6`, `@ai-sdk/openai@^3`); `generateObject`/
  `streamObject` are banned — use `generateText`/`streamText` with `Output.object`.
  `typescript` stays on 5.x (Next 16 doesn't support TS 7).
- Schema absence is `.nullable()`, never `.optional()` (strict JSON schema mode).

## TypeScript

- Never use `any` unless 100% necessary or specifically instructed.

## Commands

- `pnpm test` — Vitest (no network needed)
- `pnpm typecheck` — tsc strict
- `pnpm build` — Next production build

- Don't run dev server commands (e.g., `pnpm dev`) — assume it's already running.
- Don't run build commands unless specifically told to.
- Focus on checking commands like `pnpm typecheck` and `pnpm test`.

## Package Managers

- Use pnpm if the project already uses it, otherwise use bun.
- Never use npm or yarn.

## Code Style

- Always strive for concise, simple solutions.
- If a problem can be solved in a simpler way, propose it.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Picking models for workflows and subagents

When spawning subagents (Agent tool) or Workflow stages, pick the model deliberately.
Rankings, higher = better. Cost reflects what I actually pay (gpt-5.6 is near-free for
me), not list price. Intelligence = how hard a problem the model takes unsupervised.
Taste = UI/UX, code quality, API design, copy.

| model    | cost | intelligence | taste |
| -------- | ---- | ------------ | ----- |
| gpt-5.6  | 9    | 8            | 5     |
| sonnet-5 | 5    | 5            | 7     |
| opus-4.8 | 4    | 7            | 8     |
| fable-5  | 2    | 9            | 9     |

How to apply:

- Defaults, not limits. Standing permission to override: if a cheaper model's output
  misses the bar, rerun with a smarter one without asking. Judge the output, not the
  price — escalating costs less than shipping mediocre work.
- Cost is a tie-breaker only; when axes conflict for anything that ships,
  intelligence > taste > cost.
- Bulk/mechanical work (clear-spec implementation, migrations, data analysis): gpt-5.6.
- Anything user-facing (the conversational flow, chip copy, prose templates) needs
  taste ≥ 7 — fable-5 or opus-4.8.
- Reviews of plans/implementations: fable-5 or opus-4.8; optionally gpt-5.6 as an extra
  independent perspective.
- Never use Haiku.
- Claude models (sonnet-5, opus-4.8, fable-5) run via the Agent/Workflow `model`
  parameter. gpt-5.6 is only reachable through the Codex CLI (`codex exec`), run at
  `sol high` reasoning.

Using gpt-5.6 inside workflows/subagents (the `model` param only takes Claude models):

- Spawn a thin Claude wrapper (`model: 'sonnet', effort: 'low'`) whose prompt writes a
  self-contained codex prompt, runs `codex exec` at `sol high` reasoning via Bash, and
  returns the report (use `schema` for structured output). Label it `gpt-5.6:...` — the
  workflow UI shows the wrapper's Claude model, so the label is the only signal of the
  real worker.
- Codex runs can exceed Bash's 10-minute timeout: pass an explicit timeout or run in
  the background and poll for the report. Parallel gpt-5.6 editors need
  `isolation: 'worktree'` so codex edits don't collide. Workflow token budgets count
  only Claude tokens; codex work is invisible to `budget.spent()`.

## General preferences

- If asked to do too much work at once, stop and state that clearly.
- If computer use is helpful for completing or verifying work, shell out to gpt-5.6 with
  high reasoning effort in Codex for it.
