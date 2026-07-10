# Repository Guidelines

## Project Structure & Module Organization

Rota is a Next.js App Router application written in strict TypeScript. UI and route orchestration live in `src/app/`; keep business logic out of this layer. Shared Zod schemas and domain types belong in `src/lib/schema/`. The deterministic search core lives in `src/lib/engine/`, while future LLM integrations belong only in `src/lib/parser/` and `src/lib/prose/`. Tests are colocated with their modules as `*.test.ts`; parser fixtures live in `src/lib/parser/fixtures.ts`.

Before changing behavior, read `PRD.md`, `ARCHITECTURE.md`, and `ROADMAP.md`. Update the roadmap when milestones or open decisions change.

## Build, Test, and Development Commands

- `npm run dev` starts the local Next.js development server.
- `npm test` runs the network-free Vitest suite once.
- `npm run test:watch` reruns affected tests during development.
- `npm run typecheck` checks strict TypeScript without emitting files.
- `npm run build` creates the production Next.js build.
- `npm start` serves an existing production build.

Run tests, typecheck, and build before requesting review.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, single quotes, no semicolons, and trailing commas in multiline structures. Use `camelCase` for functions and variables, `PascalCase` for types and React components, and descriptive kebab-case filenames such as `intent-diff.ts`. Prefer `import type` for type-only imports and the `@/*` alias for cross-tree imports.

Preserve the architecture boundaries enforced by `src/lib/import-boundaries.test.ts`. Engine code must remain pure and may import only Zod, schema modules, or other engine modules. Represent schema absence with `.nullable()`, never `.optional()`.

## Testing Guidelines

Use Vitest with explicit `describe`/`it` cases. Name tests `<module>.test.ts` and cover deterministic behavior directly without mocks in the engine. Add regression tests for every behavior change, including normalization, full-intent preservation, and exact changed-field sets where relevant. No formal coverage threshold is configured; focus on meaningful branch and invariant coverage.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, sentence-style subjects (for example, `Add ROADMAP.md ...`). Keep each commit focused. Pull requests should summarize behavior and architecture impact, link relevant issues or roadmap items, list verification commands, and include screenshots for visible UI changes. Call out environment or schema changes explicitly; never commit secrets or populated `.env` files.
