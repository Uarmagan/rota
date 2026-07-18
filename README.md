# Rota

[Try the live demo](https://rota.ugur.dev)

![Rota conversational flight search demo](public/rota-demo.png)

Rota turns natural-language trip requests into an explicit, editable search
intent. It searches simulated flight inventory with a deterministic engine and
shows why the best result matches the request.

## About the demo

- Flights and fares are simulated. Rota is a demonstration, not a booking
  service.
- Natural-language searches and result explanations are processed with the
  OpenAI API.
- Usage limits apply, so AI features may occasionally be unavailable.
- Rota does not store search text or create visitor profiles. Vercel Web
  Analytics counts basic page visits. See the
  [privacy page](https://rota.ugur.dev/privacy) for details.

## Run locally

Rota requires Node.js 20 or newer and pnpm 10.12.1.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Set `OPENAI_API_KEY` in `.env.local`. `ROTA_MODEL` optionally selects the
OpenAI model used for parsing and result explanations. See
[`.env.example`](.env.example) for the remaining configuration options.

Open [http://localhost:3000](http://localhost:3000) after the development
server starts.

## How it works

- `src/app/` contains the Next.js routes and interaction surface.
- `src/lib/schema/` owns the shared Zod schemas and domain types.
- `src/lib/engine/` contains pure normalization, filtering, ranking, and
  explanation-fact logic.
- `src/lib/parser/` and `src/lib/prose/` are the only OpenAI model boundaries.
- `src/lib/availability/` generates deterministic simulated inventory.

The deterministic search engine has no network dependency. The parser and prose
boundaries are isolated so their outputs can be validated before they enter the
engine. Import-boundary tests keep those responsibilities separate.

## Verify

```bash
pnpm test
pnpm typecheck
pnpm build
```

The test suite is network-free. Live model evaluation is a separate, optional
workflow and is not part of CI.

## Contributing and security

Issues and focused pull requests are welcome, but support, review, and ongoing
maintenance are not guaranteed. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
proposing a change. Report security issues privately through
[SECURITY.md](SECURITY.md), not in a public issue.

## License

Rota is available under the [MIT License](LICENSE). See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for notices covering vendored
materials.
