# Plan 005: Bound and meter public LLM-backed route work

> **Executor instructions**: Follow this plan exactly and update
> `advisor-plans/README.md` when done. This plan provides per-process protection and an
> explicit production seam; it must not be represented as a globally distributed rate
> limit. Stop on every STOP condition.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 32d5f8f..HEAD -- src/app/api src/lib/schema/trip-intent.ts src/lib/engine/facts-schema.ts .env.example
> shasum -a 256 src/app/api/parse/route.ts src/app/api/explain/route.ts src/app/api/http.ts src/app/api/deps.ts src/lib/schema/trip-intent.ts src/lib/engine/facts-schema.ts
> ```
>
> Expected hashes are recorded in `advisor-plans/README.md`. STOP on semantic drift.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `32d5f8f`, 2026-07-13

## Why this matters

Both public POST routes can trigger paid OpenAI work. Their prompt-bearing strings and
request bodies are unbounded, and no application gate limits call rate or concurrency.
Anonymous deployment can therefore turn oversized or repeated requests into avoidable
memory pressure and model spend. Bounds must reject work before injected parser or
explainer dependencies are called.

## Current state

- `src/app/api/parse/route.ts:13-35` accepts `utterance: z.string().min(1)`, parses the
  full body with `request.json()`, then calls the parser.
- Shared `placeSchema.city` is unbounded (`src/lib/schema/trip-intent.ts:35-38`), so a
  caller-controlled current intent can inflate the parser prompt.
- `src/app/api/explain/route.ts:7-21` immediately sends schema-valid caller facts to the
  explainer; `program` and `optionId` are unbounded.
- Handlers already inject parser/explainer dependencies, making “rejected request never
  calls paid dependency” directly testable.
- Accounts/auth are explicitly out of MVP. This plan adds abuse controls, not identity.

Current unbounded route schemas:

```ts
// src/app/api/parse/route.ts:13-16
const requestSchema = z.object({
  currentIntent: tripIntentSchema,
  utterance: z.string().min(1),
})

// src/app/api/explain/route.ts:7
const requestSchema = z.object({ facts: explanationFactsSchema })
```

Do not modify the shared domain schemas merely to enforce transport limits: those
schemas also validate trusted engine values. Define transport-input schemas with
bounded variants or `.superRefine()` in a server-library module. Route modules must
remain thin orchestration; policy, stateful admission, identity derivation, and
environment decoding do not belong under `src/app/`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm exec vitest run src/lib/server/request-body.test.ts src/lib/server/request-gate.test.ts src/lib/server/request-client.test.ts src/lib/server/request-gate-config.test.ts src/lib/server/llm-route-contracts.test.ts src/app/api/parse/route.test.ts src/app/api/explain/route.test.ts` | all pass |
| Full tests | `pnpm test` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:

- `src/lib/server/request-body.ts` and `request-body.test.ts` (new)
- `src/lib/server/request-gate.ts` and `request-gate.test.ts` (new)
- `src/lib/server/request-client.ts` and `request-client.test.ts` (new)
- `src/lib/server/request-gate-config.ts` and `request-gate-config.test.ts` (new)
- `src/lib/server/llm-route-contracts.ts` and `llm-route-contracts.test.ts` (new)
- `src/app/api/parse/route.ts` and `route.test.ts`
- `src/app/api/explain/route.ts` and `route.test.ts`
- `src/app/api/deps.ts`
- `ARCHITECTURE.md` to record the server-library boundary
- `.env.example` for names/default descriptions only; never add values or secrets

**Out of scope**:

- Auth/accounts, CAPTCHA, database/provider selection, deployment dashboards, or secret
  values.
- Shared TripIntent and ExplanationFacts domain schema changes.
- Search SSE rate limiting; it performs no paid/model work.
- OpenAI provider/model/retry changes and UI redesign.
- Claiming an in-memory gate is global across serverless instances.

## Git workflow

- Branch: `advisor/005-bound-llm-routes`
- Prefer two commits: `Bound LLM route inputs`, then `Gate LLM route calls`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a byte-limited JSON reader

Replace direct `request.json()` on the two paid routes with a shared Web-API helper that
reads `request.body` incrementally, counts encoded bytes, cancels the reader once the
configured limit is exceeded, and then parses JSON. Define typed outcomes for malformed
JSON and too-large bodies; do not throw raw parser messages into responses.

Use one documented constant suitable for the small contracts (start at 32 KiB unless
existing deployment limits require a lower value). Reject oversized bodies with stable
`{ error: 'request_too_large' }`, status 413.

**Verify**: `http.test.ts` covers exact boundary, one byte over, missing body, malformed
JSON, and chunked input without `Content-Length`.

### Step 2: Bound every prompt-bearing route field

Define bounded transport schemas in `src/lib/server/llm-route-contracts.ts`:

- Parse utterance: trim; 1-500 Unicode code points.
- Every current-intent city label: 1-100.
- Explain `optionId` and program: 1-100.
- Numeric facts: retain domain constraints and add defensive maxima high enough for the
  simulation but finite (document each maximum in code).

Preserve the public success response shapes. Invalid bounded fields return the existing
400 `invalid_request`. Add tests asserting the parser/explainer spy is never called.

Do not tighten shared schemas; transport concerns stay in the server library and the
routes only invoke the bounded parsers.

**Verify**: parse/explain focused tests cover exact maximum and one over for strings,
plus an excessive numeric fact.

### Step 3: Add an injected model-call gate

Create a small interface used by both handlers with an explicit acquire/release
lifecycle. Do not add an operation parameter unless it changes admission behavior. The
default implementation must:

- cap active model calls per process,
- cap calls per fixed time window globally and per client key,
- use a bounded/pruned client map so the limiter itself cannot grow without limit,
- accept a clock in tests,
- return a retry-after duration on rejection,
- release concurrency in `finally`, including dependency throws.

Derive client keys conservatively: use the first trusted forwarded address only when a
documented proxy-trust environment flag is enabled; otherwise use one shared anonymous
bucket. Never trust arbitrary `x-forwarded-for` by default.

Add non-secret environment names with safe defaults to `.env.example`, such as maximum
concurrency and calls per minute. Parse invalid configuration at startup/factory time and
fail closed with a clear server-side error; do not echo configuration details publicly.

Keep limiter state, client identity derivation, and environment decoding in the focused
`request-gate.ts`, `request-client.ts`, and `request-gate-config.ts` modules respectively;
no stateful limiter or deployment policy may live under `src/app`. Inject the gate into
`handleParse`/`handleExplain` just like
parser/explainer dependencies so tests remain deterministic. Route `POST` functions use
the default singleton from `deps.ts`. Rejections return 429, stable `rate_limited`, and
`Retry-After`; paid dependencies must not be called.

**Verify**: gate tests cover per-client limit, global limit, concurrency, pruning,
clock-window reset, and release after throw. Handler tests prove 429 and no dependency
call.

### Step 4: Preserve error and resource behavior

Ensure every acquired permit releases in `finally`. Preserve 422/502 parser mapping and
the explainer's fallback success behavior. Do not include IPs, utterances, facts, or model
output in error responses or new logs.

**Verify**: existing route tests plus new focused tests pass.

### Step 5: Run full gates and record deployment limitation

Run full tests, typecheck, and build. In the plan maintenance note/index status, record
that code-level quotas are per process. Before public multi-instance deployment, the
operator must configure an edge/shared limit and provider billing ceiling; this code
does not prove global spend containment.

## Test plan

- `request-body.test.ts`: bounded streaming reader at/over the byte limit, chunked input,
  missing body, malformed JSON, and reader cancellation.
- `request-gate.test.ts`: deterministic fake-clock coverage for client/global windows,
  concurrency, bounded-key pruning, reset, retry-after, and `finally` release.
- Parse/explain route tests: exact string bounds, one-over bounds, numeric maxima, 413,
  429, preserved success/error contracts, and proof that rejected work never reaches
  the injected paid dependency.

Follow existing handler-test construction in `src/app/api/parse/route.test.ts` and
`explain/route.test.ts`; do not start Next or call OpenAI.

## Done criteria

- [ ] Oversized bodies are rejected during streaming read with 413.
- [ ] Every prompt-bearing string and numeric route value has an explicit finite bound.
- [ ] Rejected requests never call parser/explainer.
- [ ] Per-process concurrency and request-window gates return stable 429 responses.
- [ ] The gate cannot retain unbounded client keys and always releases permits.
- [ ] Forwarded client identity is trusted only under explicit proxy configuration.
- [ ] Tests, typecheck, and build pass with no live model calls.
- [ ] Documentation says this is not a distributed/global limiter.
- [ ] The index status row is updated.

## STOP conditions

- The intended public deployment is multi-instance and the operator requires this plan
  alone to guarantee a global quota. A shared/edge product decision is required.
- A platform already supplies authoritative body/rate limits that conflict with these
  response contracts; report the exact platform configuration first.
- Implementing the gate requires a new external service, credential, or secret without
  operator approval.
- Normal current fixtures exceed a proposed bound.
- The work expands into auth, search throttling, or provider migration.

## Maintenance notes

Per-process gates are defense in depth. A production reviewer must verify the actual
edge/shared limiter and OpenAI billing ceiling separately. Revisit maxima when schemas
gain new legitimate fields, and keep rejection-before-model-call assertions whenever a
route changes.
