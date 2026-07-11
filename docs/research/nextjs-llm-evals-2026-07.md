# Modern LLM evals for Rota's Next.js stack

**Checked:** 2026-07-10  
**Scope:** production-suitable evaluation of Rota's model-dependent parser and future
prose boundary in a strict TypeScript / Next.js / AI SDK v6 repository. Sources are
first-party documentation and source repositories.

## Recommendation

Use a layered stack:

1. **Vitest remains the deterministic test runner** for schemas, engine invariants,
   fixture self-consistency, import boundaries, mocked AI SDK transport, and later the
   prose number-provenance guard.
2. **Braintrust becomes the live eval and experiment layer** around Rota's actual
   TypeScript task function. Keep the committed parser fixtures as the source of truth,
   score structured parser behavior with code rather than an LLM judge, and store each
   run as a comparable experiment.
3. **Run a small live smoke set on pull requests and the full golden set after merge or
   on schedule**, only if the team intentionally changes the current no-network-in-CI
   policy. Use an explicit Braintrust reporter for score thresholds; `bt eval` only
   fails by default when an eval throws.
4. **Add sampled asynchronous production scoring once the API routes exist.** Feed
   useful failures back into the committed fixture set. Keep AI SDK DevTools as an
   optional local debugger, not as the eval system.

This is the best current fit because Braintrust has a native TypeScript eval runner,
immutable experiments, CI support, production online scoring, and first-party AI SDK
v6 / Vercel integration. Braintrust documents the complete loop as playgrounds,
experiments, CI, asynchronous online scoring, and production-to-dataset feedback.
[Braintrust evaluation overview](https://www.braintrust.dev/docs/evaluate),
[experiment and CI runner](https://www.braintrust.dev/docs/evaluate/run-evaluations),
[Vercel AI SDK integration](https://www.braintrust.dev/docs/integrations/sdk-integrations/vercel),
[Vercel Marketplace integration](https://vercel.com/marketplace/braintrust/braintrust)

There is no Next.js-specific eval standard. Evals should run against framework-free
server functions; Next.js is only the delivery layer. This matches Rota's architecture:
the parser and future prose generator live behind interfaces under `src/lib/`, while
`src/app/` stays thin.

## What Rota already gets right

Rota is well past a blank-slate eval setup:

- `src/lib/parser/fixtures.ts` is a committed 25-case golden set with pinned dates and
  place registry context.
- `scripts/eval.ts` calls the real `OpenAIIntentParser`, performs five repetitions,
  checks the full canonical intent, exact changed-field set, and `unhandled` nullness,
  and reports pass rate, retry rate, p50, and p95 latency.
- Hostile fixtures use the stricter 5/5 threshold; ordinary fixtures require 4/5.
- Pure engine behavior and fixture consistency already run network-free in Vitest.

That scoring is more trustworthy for the parser than a generic semantic-similarity or
LLM-as-judge score. The parser contract is structured and exact, so the primary metrics
should stay deterministic:

- `exactIntent`
- `exactChangedFields`
- `unhandledPresence`
- `hostileIdentity`
- `validWithoutRetry`
- `latencyMs`

For the future prose boundary, use deterministic checks first: number provenance,
length, forbidden claims, and required fact references. Add a calibrated model judge
only for genuinely subjective qualities such as tone, and validate that judge against
human-labeled examples before making it a release gate.

## Why Braintrust is the leading choice

Braintrust's TypeScript `Eval()` model maps directly onto Rota:

- **Data:** `parserFixtures`
- **Task:** invoke `OpenAIIntentParser.parse(currentIntent, utterance)` through the
  production parser seam
- **Scores:** reuse the exact code checks from `scripts/eval.ts`
- **Metadata:** model, reasoning effort, prompt version/hash, places version, git SHA,
  attempt count, and latency

Its experiments are immutable and comparable. The CLI runs locally or in CI, supports
sampling a smaller pull-request set, and can emit machine-readable output. A custom
`Reporter()` decides whether metric thresholds should fail the process; the default
non-zero exit behavior covers thrown exceptions, not arbitrary score regression.
[Braintrust experiments and CI](https://www.braintrust.dev/docs/evaluate/run-evaluations)

Braintrust also wraps AI SDK v3-v6 calls and traces inputs, outputs, metrics, tools, and
multi-step execution. On Vercel, it can receive OpenTelemetry traces through a native
Marketplace integration. That gives Rota one path from local experiments to production
observation instead of a separate eval dashboard and tracing vendor.
[Braintrust AI SDK integration](https://www.braintrust.dev/docs/integrations/sdk-integrations/vercel),
[Vercel Braintrust integration](https://vercel.com/marketplace/braintrust/braintrust)

Online scores run asynchronously, so they do not add request latency. They should be
sampled to control judge cost and reviewed for privacy before logging real utterances.
[Braintrust online scoring](https://www.braintrust.dev/docs/evaluate/score-online)

## Comparison of the current leading approaches

| Approach | TypeScript / Next.js fit | Local and CI workflow | Production loop | Verdict for Rota |
|---|---|---|---|---|
| **Vercel AI SDK testing + DevTools** | Excellent primitives for this exact stack. `ai/test` provides mock language models and stream helpers. | Excellent for deterministic unit tests and local inspection. DevTools captures prompts, outputs, token usage, timing, and raw provider data. | DevTools is explicitly experimental, local-only, and stores interactions in plaintext. It is not an eval runner, dataset manager, regression tracker, or production monitor. | Keep Vitest + `ai/test`; optionally use DevTools to debug a failed case. Do not treat DevTools as the eval platform. [AI SDK testing](https://ai-sdk.dev/docs/ai-sdk-core/testing), [AI SDK DevTools](https://ai-sdk.dev/docs/ai-sdk-core/devtools) |
| **Braintrust** | Native TypeScript SDK; direct AI SDK v6 and Vercel integrations. Framework-agnostic task functions fit Rota's module boundaries. | `bt eval` locally and in CI; immutable experiments, comparisons, sampling, custom scorers and reporters. | Native tracing, asynchronous online scoring, and a documented production-failure-to-dataset loop. | **Recommended.** It adds the experiment history and feedback loop missing from Rota's otherwise strong custom runner. [Braintrust evals](https://www.braintrust.dev/docs/evaluate), [run evaluations](https://www.braintrust.dev/docs/evaluate/run-evaluations) |
| **LangSmith** | Strong TypeScript support and unusually good direct `langsmith/vitest` integration. It does not require LangChain to evaluate arbitrary code. | Separate `*.eval.ts` suites can retain familiar Vitest assertions, watch behavior, and CI failures while syncing datasets and experiments. | Mature offline and online evaluation, production traces, backtesting, judges, and code evaluators. | Strong runner-up, especially if the project adopts LangChain/LangGraph or values evals expressed directly as Vitest tests. For Rota today, Braintrust has the more natural Vercel/AI SDK-centered story. [LangSmith evaluation](https://docs.langchain.com/langsmith/evaluation), [Vitest/Jest integration](https://docs.langchain.com/langsmith/vitest-jest), [evaluation types](https://docs.langchain.com/langsmith/evaluation-types) |
| **promptfoo** | Strong local-first, open-source CLI and stable TypeScript Node API. A custom TS provider can call Rota's parser directly; official docs cover Next.js path aliases and Node execution constraints. | Excellent prompt/model matrices, caching, watch mode, JSON/HTML/JUnit output, CI gates, Vitest/Jest matchers, and red teaming. | Can trace and share results, but its docs center on development, CI, and security evaluation rather than a turnkey continuous online-scoring feedback loop. | Best alternative when OSS/local-first operation, declarative model comparison, or adversarial red teaming outweigh integrated production monitoring. [promptfoo overview](https://www.promptfoo.dev/docs/intro/), [TypeScript custom providers](https://www.promptfoo.dev/docs/providers/custom-api/), [CI/CD](https://www.promptfoo.dev/docs/integrations/ci-cd/), [Node API](https://www.promptfoo.dev/docs/usage/node-api-reference/) |
| **OpenAI Datasets / legacy Evals** | The current Datasets UI supports prompt variants, annotations, exact/string, similarity, model, and Python graders. It is naturally OpenAI-specific and does not exercise Rota's complete AI SDK/parser wrapper as naturally as a code-first task runner. | Datasets is useful for rapid, dashboard-based OpenAI prompt iteration; the older Evals API supports managed runs and reports. | OpenAI now labels Evals a legacy API and is deprecating that platform: read-only on 2026-10-31 and shutdown on 2026-11-30. Graders remain part of the newer Datasets workflow. | **Do not start Rota's main harness on the legacy Evals API.** OpenAI Datasets can be a supplementary model-specific playground, but it should not replace the repo-owned fixtures or production task path. [OpenAI Datasets](https://developers.openai.com/api/docs/guides/evaluation-getting-started), [OpenAI Evals deprecation](https://developers.openai.com/api/docs/guides/evals), [OpenAI Graders](https://developers.openai.com/api/docs/guides/graders) |
| **Evalite beta** | Familiar TypeScript `.eval.ts` API built on Vitest, local UI, CI HTML export, and score thresholds. | Attractive lightweight local runner. | Its current v1 documentation still instructs users to install `evalite@beta`; it does not present the same production tracing and online feedback loop as Braintrust or LangSmith. | Worth watching, but not the production default for this repo today. [Evalite v1 beta docs](https://v1.evalite.dev/) |

## Suggested workflow for this repository

### Local development

1. Run ordinary `pnpm test` continuously for pure behavior and fixture consistency.
2. Run the current `pnpm eval -- --fixture <name>` while changing the prompt.
3. Use AI SDK DevTools only when the raw request/response or retry path needs visual
   inspection. Never enable it in production or with sensitive real-user inputs; its
   own documentation says it stores captured content locally in plaintext.
4. Run the full live Braintrust experiment before accepting a prompt/model change.

### CI and release gates

The repository currently says the networked eval never runs in CI. Preserve that
contract until the roadmap explicitly changes it. If the team does opt into live CI:

- **Every pull request:** deterministic Vitest gates plus one live repetition of a
  small, fixed smoke slice covering lazy query, refinement, relative date, unsupported
  clause, and hostile identity. Compare against a pinned baseline and enforce a cost
  ceiling.
- **Merge or scheduled run:** all 25 fixtures, five repetitions, existing 4/5 and 5/5
  thresholds, plus retry rate and p95 latency limits.
- **Model or prompt promotion:** require no correctness regression, zero hostile-case
  failures, bounded retry regression, and p95 within the product latency budget.
- **Failure semantics:** distinguish model-quality failures from provider/network
  errors. A transport outage should block promotion but should not be counted as an
  incorrect parser answer.

Use exact model snapshots where the provider offers them, record prompt hashes and
reasoning effort, cap concurrency to respect provider limits, and never use cache hits
as the only release evidence after a model or prompt change.

### Production

Once M4's API routes exist:

- trace the two LLM boundaries, not the pure engine;
- log typed outcomes and metrics rather than duplicating all derived state;
- redact or avoid sensitive utterances before export;
- asynchronously score a sample for schema success, retry exhaustion, hostile identity,
  unhandled behavior, and latency;
- promote reviewed failures into `parserFixtures` so every production discovery becomes
  a permanent offline regression case.

## Migration shape, not an implementation request

No application code or dependencies were changed by this research. A later implementation
should keep `scripts/eval.ts` working first, then extract its task and scorer functions so
both the console runner and Braintrust call the same code. Do not duplicate fixture logic
in a vendor dashboard. The committed TypeScript fixtures must remain the canonical dataset.

The immediate conclusion is simple: **keep Rota's custom deterministic fixture logic,
add Braintrust for live experiment history and the production feedback loop, and use
AI SDK DevTools only as a local microscope.**
