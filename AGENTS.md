# Repository preferences

Read `CLAUDE.md` before making changes; it owns project invariants and documentation workflow.

## Commands

- `pnpm test`
- `pnpm typecheck`
- Run `pnpm build` only when requested; assume the dev server is already running.

## Style

- Use two spaces, single quotes, no semicolons, and trailing commas in multiline structures.
- Use `import type` for type-only imports.
- Represent schema absence with `.nullable()`, never `.optional()`.
- Preserve the module boundaries enforced by `src/lib/import-boundaries.test.ts`.
