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
- No number shown to a user may originate from an LLM.
- AI SDK is pinned to the v6 line (`ai@^6`, provider `@2`); `generateObject`/
  `streamObject` are banned — use `generateText`/`streamText` with `Output.object`.
  `typescript` stays on 5.x (Next 16 doesn't support TS 7).
- Schema absence is `.nullable()`, never `.optional()` (strict JSON schema mode).

## Commands

- `npm test` — Vitest (no network needed)
- `npm run typecheck` — tsc strict
- `npm run build` — Next production build

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
