# Contributing

Thanks for taking an interest in Rota. Issues and focused pull requests are
welcome, but this portfolio demo does not promise support, review, or ongoing
maintenance.

Before opening a pull request:

1. Check for an existing issue or open a short proposal for larger changes.
2. Keep business logic out of `src/app/` and preserve the boundaries in
   [ARCHITECTURE.md](ARCHITECTURE.md).
3. Represent schema absence with `.nullable()`, not `.optional()`.
4. Add regression tests for behavior changes. Tests must not call live APIs.
5. Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.

Use short, imperative commit subjects and keep each commit focused. Never
commit API keys, populated environment files, personal data, or live evaluation
output.

By contributing, you agree that your contribution may be distributed under
the repository's [MIT License](LICENSE).
