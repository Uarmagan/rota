# Hono for Rota's API routes

**Checked:** 2026-07-11  
**Scope:** whether Hono would make the M4 Next.js App Router API smaller or clearer.
Sources are official Hono and Next.js documentation, official Hono source, and npm
package metadata. No runtime code or dependencies were changed.

## Recommendation

**Do not adopt Hono yet.** Keep the current Web-standard Next.js Route Handlers and
extract one small, typed JSON-validation helper if repetition grows.

Hono is a credible choice, but it does not currently deepen Rota's architecture:

- Next.js Route Handlers already receive and return Web `Request` and `Response`
  objects. Hono's Next.js adapter is itself only a call to `app.fetch(request)`, so
  there is no transport capability missing from the current implementation.
  [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers),
  [Hono Vercel adapter source](https://github.com/honojs/hono/blob/main/src/adapter/vercel/handler.ts)
- Hono's documented App Router setup moves the endpoints behind
  `app/api/[[...route]]/route.ts` and exports `handle(app)` for each supported method.
  That can centralize a growing API, but for Rota's three fixed endpoints it adds a
  second routing layer on top of Next's filesystem router.
  [Hono Next.js guide](https://hono.dev/docs/getting-started/nextjs)
- The largest apparent saving is the 55-line SSE helper. Hono's `streamSSE` does
  supply framing, headers, writes, closing, and abort hooks, but the domain loop,
  terminal `done` event, iterator cleanup, and cancellation behavior still belong to
  Rota and still need tests. Streaming callback errors also bypass `app.onError`
  because the response has already started.
  [Hono streaming helper](https://hono.dev/docs/helpers/streaming),
  [Hono SSE source](https://github.com/honojs/hono/blob/main/src/helper/streaming/sse.ts),
  [Hono stream lifecycle source](https://github.com/honojs/hono/blob/main/src/utils/stream.ts)

Adopt Hono later if the API becomes a module in its own right: roughly 8–10 routes,
shared auth/CORS/rate-limit middleware, typed client RPC, or deployment outside
Next.js. At that point a central application object and middleware pipeline would be
an architectural seam rather than a line-count optimization.

## Current Rota shape

The production API layer is **211 physical lines** today:

| Area | Files | Lines |
|---|---|---:|
| Dependency construction | `src/app/api/deps.ts` | 31 |
| HTTP error helpers | `src/app/api/http.ts` | 7 |
| SSE framing and lifecycle | `src/app/api/sse.ts` | 55 |
| Parse route | `src/app/api/parse/route.ts` | 51 |
| Search route | `src/app/api/search/route.ts` | 41 |
| Explain route | `src/app/api/explain/route.ts` | 26 |

The three route tests add 289 lines, but those lines mostly express behavior rather
than framework boilerplate: exact error contracts, normalization, deterministic SSE
ordering, and dependency substitution. The architecture intentionally tests exported
Web handlers directly without a Next runtime. Hono would preserve this capability via
`app.request()`—its official testing guide uses the same Web `Request`/`Response`
model and demonstrates Vitest-style tests—but would not remove the behavioral cases.
[Hono testing guide](https://hono.dev/docs/guides/testing)

The current shape has two valuable properties worth preserving:

1. `handleParse`, `handleSearch`, and `handleExplain` make dependency injection
   explicit at the narrowest possible seam.
2. `sourceBatchStream` owns the subtle protocol lifecycle in one place: both request
   abort and response cancellation call `iterator.return()`, while normal completion
   emits exactly one terminal `done` event.

## What Hono would simplify

### Routing and response syntax

One catch-all Next route could export a Hono app:

```ts
// src/app/api/[[...route]]/route.ts
import { handle } from 'hono/vercel'
import { createApi } from '../app'

const app = createApi(createApiDependencies())

export const GET = handle(app)
export const POST = handle(app)
```

Handlers could use `c.json(...)`, `c.req.query(...)`, and a shared middleware stack.
Hono officially documents this catch-all form for Next.js App Router on the Node.js
runtime. The Pages Router requires a different Node adapter; Rota does not use it.
[Hono Next.js guide](https://hono.dev/docs/getting-started/nextjs)

This only pays off if the API is centralized. Wrapping each existing Next
`route.ts` independently would retain the file and export boilerplate while adding
Hono contexts, so it is the least attractive integration.

### Zod validation

`@hono/zod-validator` can validate `json`, `query`, `param`, and other targets, expose
typed values through `c.req.valid(...)`, and use a hook to preserve Rota's exact
`{ error: 'invalid_request', detail }` response.
[Hono validation guide](https://hono.dev/docs/guides/validation),
[validator error handling](https://hono.dev/examples/validator-error-handling)

There are two catches for this API:

- The validator parses JSON only when `Content-Type` matches JSON; otherwise it
  validates `{}`. Rota's current `request.json()` behavior accepts a valid JSON body
  without that header. Switching silently would therefore tighten the HTTP contract.
  [Hono validator source](https://github.com/honojs/hono/blob/main/src/validator/validator.ts)
- `/api/search` carries a JSON-encoded `intent` query parameter. Hono can retrieve the
  string, but JSON decoding, parse-error mapping, and `tripIntentSchema` validation
  remain route-specific. Middleware does not make that unusual wire format simpler.

For only two JSON bodies, adding both Hono and `@hono/zod-validator` is more mechanism
than the duplication warrants. A local generic helper can remove the repeated
`request.json()`/`safeParse` block while preserving behavior exactly.

### SSE and cancellation

A Hono version of the search stream would be shorter at the call site:

```ts
return streamSSE(c, async (stream) => {
  const iterator = provider.search(query)[Symbol.asyncIterator]()
  stream.onAbort(() => iterator.return?.())

  for await (const batch of { [Symbol.asyncIterator]: () => iterator }) {
    if (stream.aborted) break
    await stream.writeSSE({ event: 'batch', data: JSON.stringify(batch) })
  }

  if (!stream.aborted) {
    await stream.writeSSE({ event: 'done', data: '{}' })
  }
})
```

`streamSSE` supplies `Content-Type: text/event-stream`, no-cache and keep-alive
headers, a `writeSSE` formatter, `onAbort`, and automatic closing when its callback
finishes. Its underlying streaming implementation turns response cancellation into
an abort notification. It also intentionally swallows write failures, while callback
errors need the helper's own error callback rather than the application-wide error
handler. Those are reasonable library semantics, but adopting them is a behavior
choice, not a purely mechanical deletion.
[Hono streaming helper](https://hono.dev/docs/helpers/streaming),
[Hono stream lifecycle source](https://github.com/honojs/hono/blob/main/src/utils/stream.ts)

The current helper is longer because its guarantees are visible. Replacing it is
worthwhile only if the team prefers Hono's lifecycle contract and pins it with the
existing full-stream plus new cancellation tests.

## Runtime and dependency cost

As checked from the npm registry, the current releases are `hono@4.12.29` and
`@hono/zod-validator@0.8.0`. Hono declares no direct dependencies; the validator
package declares Hono and Zod as peers. Hono's own repository describes the
`hono/tiny` preset as under 14 kB and the framework as Web-standard and
multi-runtime. These facts make the dependency technically low-risk, but it still
adds two versioned server packages and an adapter/lifecycle contract to maintain.
[Hono package](https://www.npmjs.com/package/hono),
[`@hono/zod-validator` package](https://www.npmjs.com/package/%40hono%2Fzod-validator),
[Hono repository](https://github.com/honojs/hono)

There should be no client-bundle reason to reject Hono when it is imported only by
server Route Handlers. The reason to defer is architectural economy: Rota already
depends on Next.js for routing, and the current API needs none of Hono's broader
middleware or portability surface.

## Rough before/after estimate

The estimate below counts production API code, not tests, and assumes all current
HTTP and cancellation contracts are retained:

| Shape | Estimated lines | Change | Notes |
|---|---:|---:|---|
| Current Next handlers | 211 actual | — | Includes 31-line dependency wiring and 55-line explicit SSE lifecycle |
| Hono catch-all, manual Zod | 155–180 | 15–27% less | One app factory, catch-all adapter, Hono SSE; keeps manual parsing for exact semantics |
| Hono + Zod validator | 145–170 | 19–31% less | Shorter JSON routes, but adds a second package and changes missing-content-type behavior unless wrapped |
| Native focused helpers | 190–200 | 5–10% less | Keep Next routing; consolidate only repeated JSON parsing and error mapping |

The Hono figure is not a 60-line application because the important code remains:
dependency injection, parse error mapping, normalization, search-query conversion,
the domain event loop, terminal event behavior, and exact response envelopes. Tests
would likely move from three handler entry points to `createApi(testDependencies)` and
`app.request(...)`; their count should remain approximately flat.

## Most appropriate abstraction seams now

### 1. Add one schema-aware JSON reader

If another JSON endpoint lands—or if the current repetition already bothers the
team—extend `src/app/api/http.ts` with a generic helper whose output forces callers to
handle failure:

```ts
type ParsedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response }

async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ParsedBody<T>>
```

This removes the duplicated `try/catch` and `safeParse` blocks from parse and explain,
keeps the public error contract in one place, keeps `Content-Type` behavior unchanged,
and introduces no framework dependency. It is a small, deep module: one policy-heavy
operation behind one typed call.

### 2. Keep `sourceBatchStream` as the SSE boundary

Do not inline or generalize it into an all-purpose stream builder. Its apparent
verbosity is concentrated protocol correctness: exact event names, JSON framing,
normal completion, request abort, consumer cancellation, and async-iterator cleanup.
Those details are more valuable hidden behind the existing domain-specific function
than hidden behind a generic framework plus another adapter.

An optional refinement is to accept an event serializer or make it generic only when
a second SSE endpoint appears. Until then, `SourceBatch` is the correct narrow type.

### 3. Preserve handler-level dependency injection

The existing `handleX(request, dependency)` signatures are simpler than a dependency
container for three unrelated interfaces. If Hono is adopted later, use a
`createApi(dependencies)` factory rather than module-global dependency mutation; then
Vitest can still construct a complete application with parser, provider, and explainer
stubs and call `app.request()`.

## Decision trigger

Revisit Hono when at least one of these becomes true:

- API route count and shared middleware make the catch-all app measurably smaller;
- Rota wants a typed Hono client/RPC contract across server and browser;
- authentication, CORS, rate limits, or observability should run through one API
  middleware pipeline; or
- the API needs to run outside Next.js with the same application object.

Until then, the simplest version of Rota is the one it already has: Next owns routing,
Web APIs own transport, Zod owns validation, and small Rota modules own its exact
contracts.
