# Runtime LLM selection for TripIntent parsing

Research snapshot: 2026-07-10 (America/Chicago)

## Decision

**Top recommendation: `google/gemma-4-26b-a4b-it`, routed to a schema-capable
provider such as DeepInfra.** It is the best current open-weight fit for the ordered
priorities: OpenRouter reports about 1.57 seconds end to end on DeepInfra and a 0.20%
structured-output error rate, while the model is Apache 2.0 and its reasoning-mode
IFBench score (72.4%) is materially stronger than the other latency-qualified open
models. It is not vendor-native strict JSON Schema in the same sense as OpenAI, Gemini,
or Claude, so use `require_parameters: true`, pin a provider that advertises
`structured_outputs`, and keep the exact TripIntent fixture suite as the promotion
gate. [OpenRouter model/providers](https://openrouter.ai/google/gemma-4-26b-a4b-it/providers),
[Google model card](https://ai.google.dev/gemma/docs/core/model_card_4)

**Cheap alternative: `deepseek/deepseek-v4-flash`.** It is the newest strong
open-weight small/flash candidate found, is MIT licensed, costs roughly $0.09/M input
and $0.18/M output on OpenRouter, and has unusually strong instruction/dual-control
proxies at high/max reasoning. The tradeoff is operational: its fastest recent
OpenRouter end-to-end result is about 2.23 seconds, first-party direct responses expose
JSON mode rather than strict JSON Schema, and strictness is supplied only by some
OpenRouter backends. [OpenRouter benchmarks](https://openrouter.ai/deepseek/deepseek-v4-flash/benchmarks),
[DeepSeek model card and license](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash),
[DeepSeek JSON mode](https://api-docs.deepseek.com/guides/json_mode)

Keep `openai/gpt-5.4-mini` as the **closed-model control** in the parser eval. If Gemma
or DeepSeek misses hostile-input identity, untouched-state preservation, or
`unhandled` classification, GPT-5.4 Mini is the evidence-backed fallback: it has
vendor-native strict output, about 2.05-second recent OpenRouter E2E latency on OpenAI,
and about 0.29% observed structured-output errors.
[OpenRouter performance](https://openrouter.ai/openai/gpt-5.4-mini/performance)

**2026-07-10 update: add `openai/gpt-5.6-luna` as a closed-model canary, but do not
promote it blindly on launch day.** It is technically compatible with this call site,
has native Structured Outputs, and has unusually relevant prompt-injection evidence.
At non-reasoning or low effort it is the most promising closed challenger to the
open-weight default; the remaining unknown is real OpenRouter E2E and structured-output
retry telemetry. See the focused Luna assessment below.

## How to read the evidence

- OpenRouter's latency, E2E, and structured-output-error values are rolling production
  telemetry. They are useful deployment signals, but request lengths, reasoning modes,
  regions, and schemas differ. They are not an SLA or a controlled model bake-off.
- "Native strict" below means the model vendor documents grammar/constrained decoding
  against a supplied JSON Schema and OpenRouter exposes it on the relevant route.
  "Provider strict" means an OpenRouter inference host adds constrained decoding even
  though the model vendor documents only JSON mode, tool schemas, or prompt-guided
  formatting.
- IFBench is a proxy for following several precise instructions at once. Tau2-Bench is
  a proxy for maintaining policy and state in a dual-control conversation. Neither is
  a date-resolution, full-object-preservation, or prompt-injection benchmark.
  [IFBench methodology](https://allenai.org/blog/ifbench-artificial-analysis)
- No public apples-to-apples injection benchmark covered the newest Gemma 4,
  DeepSeek V4, GPT-5.4, and Gemini 3.x models. Claude Haiku 4.5 has the strongest direct
  published security evidence, but its current OpenRouter structured-output path is
  too unreliable for this call site. [B3 benchmark](https://b3.lakera.ai/),
  [Claude Haiku 4.5 system card](https://assets.anthropic.com/m/99128ddd009bdcb/Claude-Haiku-4-5-System-Card.pdf)

## Ranked shortlist

### 1. `google/gemma-4-26b-a4b-it` — top open-weight recommendation

- **Open status:** Apache 2.0 open weights; 25.2B total / 3.8B active MoE, released
  2026-04-03. [Google model card](https://ai.google.dev/gemma/docs/core/model_card_4)
- **Strict JSON Schema on OpenRouter:** **Partial / provider strict.** DeepInfra,
  Parasail, NextBit, Venice, SiliconFlow, and Google currently advertise both
  `response_format` and `structured_outputs`; several faster/cheaper endpoints do not.
  Do not rely on the model-level aggregate flag.
  [OpenRouter Endpoints API](https://openrouter.ai/api/v1/models/google/gemma-4-26b-a4b-it/endpoints)
- **Latency/reliability:** about 0.32-second p50 and 1.57-second E2E on DeepInfra;
  observed structured-output errors are about 0.20% on DeepInfra, 0.30% on Parasail,
  and 0.48% on NextBit. [OpenRouter performance](https://openrouter.ai/google/gemma-4-26b-a4b-it/pricing)
- **Cost:** roughly $0.06/M input and $0.33/M output headline; DeepInfra is currently
  about $0.07/$0.34. [OpenRouter providers](https://openrouter.ai/google/gemma-4-26b-a4b-it/providers)
- **Instruction/hostile read:** reasoning-mode IFBench 72.4%, Tau2 43.6%; Google's own
  model card reports 68.2% Tau2 average. This is adequate evidence for a first bake-off,
  but there is no direct current injection benchmark, and non-reasoning IFBench falls
  to 45.4%. Start with the smallest reasoning setting that still meets the latency
  budget. [OpenRouter benchmarks](https://openrouter.ai/google/gemma-4-26b-a4b-it/providers),
  [Google evaluations](https://ai.google.dev/gemma/docs/core/model_card_4)

### 2. `deepseek/deepseek-v4-flash` — newest strong open-weight quality option

- **Open status:** MIT-licensed weights; 284B total / 13B active MoE, released
  2026-04-24. [DeepSeek model card](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash)
- **Strict JSON Schema on OpenRouter:** **Partial / provider strict.** Many OpenRouter
  endpoints advertise `structured_outputs`, but several do not, including the current
  first-party DeepSeek route. First-party DeepSeek documents direct `json_object` mode;
  its strict JSON Schema support is a separate beta tool-call path, not direct
  `Output.object` semantics. [OpenRouter Endpoints API](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash/endpoints),
  [DeepSeek JSON mode](https://api-docs.deepseek.com/guides/json_mode),
  [DeepSeek strict tools](https://api-docs.deepseek.com/guides/tool_calls)
- **Latency/reliability:** best recent p50 is about 0.60 seconds and best listed E2E is
  about 2.23 seconds. Schema-capable providers show roughly 0.20-0.89% structured-output
  errors at the good end, but provider variance is large.
  [OpenRouter benchmarks](https://openrouter.ai/deepseek/deepseek-v4-flash/benchmarks)
- **Cost:** roughly $0.09/M input and $0.18/M output headline on OpenRouter; providers
  vary. [OpenRouter providers](https://openrouter.ai/deepseek/deepseek-v4-flash/providers)
- **Instruction/hostile read:** IFBench/Tau2 are 79.2%/95.0% at max reasoning and about
  47.2%/94.4% without reasoning. The max-quality numbers cannot be combined with the
  low-latency numbers as though they were one operating point. Artificial Analysis also
  reports a 96% hallucination rate when the max-reasoning model does not know an answer,
  a caution for conservative `unhandled`/identity behavior.
  [OpenRouter benchmarks](https://openrouter.ai/deepseek/deepseek-v4-flash/benchmarks),
  [Artificial Analysis](https://artificialanalysis.ai/articles/deepseek-is-back-among-the-leading-open-weights-models-with-v4-pro-and-v4-flash)

### 3. `openai/gpt-5.4-mini` — best closed control and fallback

- **Open status:** closed.
- **Strict JSON Schema on OpenRouter:** **Yes, native strict.** OpenAI and Azure routes
  advertise both required parameters. OpenAI documents `strict: true` structured output
  against a supported JSON Schema subset. [OpenAI model](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
  [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- **Latency/reliability:** OpenAI is about 0.66-second p50, 2.05-second E2E, and 0.29%
  structured-output error; Azure is slower and around 0.69% error.
  [OpenRouter performance](https://openrouter.ai/openai/gpt-5.4-mini/performance)
- **Cost:** $0.75/M input and $4.50/M output.
  [OpenRouter model](https://openrouter.ai/openai/gpt-5.4-mini/providers)
- **Instruction/hostile read:** IFBench 73.3%, Tau2 83.3% at xhigh reasoning. The mini
  has more semantic headroom than nano for hostile/unsupported-clause classification,
  while staying close to the product's latency ceiling. There is no directly comparable
  public GPT-5.4 injection score.

### 4. `mistralai/mistral-small-2603` — fastest mature open-weight candidate

- **Open status:** Apache 2.0 weights; Mistral Small 4, released 2026-03-16.
  [Mistral model guide](https://docs.mistral.ai/models/model-selection-guide?models=mistral-small-4-0-26-03)
- **Strict JSON Schema on OpenRouter:** **Partial / provider strict.** Both current
  OpenRouter endpoints advertise structured output, but Mistral's own custom-output
  documentation describes schema injection into the system prompt rather than making
  the same constrained-decoding guarantee as OpenAI/Claude.
  [Mistral custom output](https://docs.mistral.ai/studio-api/conversations/structured-output/custom),
  [OpenRouter Endpoints API](https://openrouter.ai/api/v1/models/mistralai/mistral-small-2603/endpoints)
- **Latency/reliability:** direct Mistral is about 0.39-second p50, 1.30-second E2E,
  and 0.33% structured-output error. [OpenRouter performance](https://openrouter.ai/mistralai/mistral-small-2603/benchmarks)
- **Cost:** $0.15/M input and $0.60/M output on Mistral.
- **Instruction/hostile read:** IFBench/Tau2 are only 32.8%/18.4% without reasoning
  and 48.2%/41.2% with reasoning. It is a compelling latency baseline, but a risky
  default for identity-on-hostile-input and nuanced `unhandled` classification.

### 5. `openai/gpt-5.4-nano` — fastest native-strict closed baseline

- **Open status:** closed.
- **Strict JSON Schema on OpenRouter:** **Yes, native strict** on OpenAI and Azure.
- **Latency/reliability:** about 0.48-second p50, 1.60-second E2E, and 0.10%
  structured-output error on OpenAI. [OpenRouter performance](https://openrouter.ai/openai/gpt-5.4-nano/performance)
- **Cost:** $0.20/M input and $1.25/M output.
- **Instruction/hostile read:** current IFBench/Tau2 are 75.9%/76.0% at xhigh, but the
  latency target requires little or no reasoning. OpenAI explicitly positions nano for
  classification and extraction, making it a good closed baseline, not an automatic
  winner for hostile/unsupported semantic judgment.
  [OpenAI announcement](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/)

### 6. `google/gemini-3.1-flash-lite` — native-schema closed latency challenger

- **Open status:** closed.
- **Strict JSON Schema on OpenRouter:** **Yes, native schema-constrained output** on
  current Google routes, using Google's supported JSON Schema subset. Values still
  need semantic validation. [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output),
  [OpenRouter Endpoints API](https://openrouter.ai/api/v1/models/google/gemini-3.1-flash-lite/endpoints)
- **Latency/reliability:** AI Studio is about 0.63-second p50, 1.68-second E2E, and
  0.57% structured-output error; Vertex is materially slower and less reliable.
  [OpenRouter performance](https://openrouter.ai/google/gemini-3.1-flash-lite-20260507/pricing)
- **Cost:** $0.25/M input and $1.50/M output.
- **Instruction/hostile read:** IFBench is about 77.2%, but the available Tau2 proxy is
  only about 31.3%. Google positions it for simple extraction/classification, which is
  a good match for the happy path but less reassuring for hostile identity and
  unsupported-clause judgment. [Google model card](https://deepmind.google/models/model-cards/gemini-3-1-flash-lite/)

## GPT-5.6 Luna launch-day assessment

**Verdict: yes, Rota can use it now through OpenRouter, but use it as a measured
closed-source challenger rather than replacing Gemma 4 on launch-day evidence.** The
exact standard slug is `openai/gpt-5.6-luna`. OpenRouter also exposes
`openai/gpt-5.6-luna-pro`, but that is the same underlying model with
`reasoning.mode = "pro"`; it is aimed at more compute-intensive quality, not this
1.5-2-second parse path. [OpenRouter Luna](https://openrouter.ai/openai/gpt-5.6-luna),
[OpenRouter Luna Pro](https://openrouter.ai/openai/gpt-5.6-luna-pro)

- **Availability and schema compatibility:** OpenAI released Luna on 2026-07-09 and
  describes it as the fastest, most affordable GPT-5.6 tier, roughly corresponding to
  the older nano tier. OpenAI documents native Structured Outputs and both Chat
  Completions and Responses support. OpenRouter's live endpoint metadata currently
  shows OpenAI and Azure routes advertising both `response_format` and
  `structured_outputs`, so AI SDK v6 `Output.object` maps cleanly to this model.
  [OpenAI launch](https://openai.com/index/gpt-5-6/),
  [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
  [OpenRouter Endpoints API](https://openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints)
- **Price:** $1/M input, $0.10/M cached input, and $6/M output at standard service;
  OpenRouter also exposes OpenAI Flex at $0.50/$3 and Priority at $2/$12. Standard Luna
  is more expensive than GPT-5.4 Mini ($0.75/$4.50), GPT-5.4 Nano ($0.20/$1.25), and
  every open-weight recommendation above. Cost is secondary here, so this is acceptable
  if it materially reduces semantic retries. Do not use Flex on the interactive path.
- **Latency:** independent first-party measurements report about 192.8 output tok/s,
  0.73-second TTFT with reasoning disabled, and 1.86-second TTFT at medium effort.
  That makes non-reasoning plausible for the 1.5-2-second total target; medium is
  already borderline before JSON generation and OpenRouter overhead. Max effort is a
  non-starter at roughly 91-second TTFT. Because the model is one day old, OpenRouter
  currently publishes no usable latency or structured-output-error history for it.
  [Artificial Analysis non-reasoning](https://artificialanalysis.ai/models/gpt-5-6-luna-non-reasoning),
  [medium](https://artificialanalysis.ai/models/gpt-5-6-luna-medium),
  [max](https://artificialanalysis.ai/models/gpt-5-6-luna)
- **Reasoning and instruction quality:** Artificial Analysis scores Luna at 27 with
  reasoning disabled, 38 at medium, and 51 at max. Those broad intelligence scores do
  not establish TripIntent correctness, but they show the exact latency-quality
  tradeoff that Rota must test; launch claims based on max reasoning cannot be assigned
  to the fast non-reasoning operating point. At max, Luna also reached 50.3% on Agents'
  Last Exam and 1,591.8 GDPval-AA v2 Elo.
  [Artificial Analysis launch review](https://artificialanalysis.ai/articles/gpt-5-6-has-landed),
  [OpenAI evaluations](https://openai.com/index/gpt-5-6/)
- **Hostile-input evidence:** OpenAI's system card reports 0.999 on its connector
  prompt-injection evaluation and 0.897 on the stronger search/function-calling set.
  This is the most directly relevant current hostile-instruction evidence in the
  shortlist, although it tests injected tool output rather than Rota's exact rule of
  returning prior state unchanged. The same card gives Luna only 0.73 on
  overwrite-avoidance and 0.32 on avoidance-plus-correctness, below larger GPT-5.6
  tiers, which is a caution for untouched-state preservation.
  [GPT-5.6 system card](https://deploymentsafety.openai.com/gpt-5-6-preview/gpt-5-6-preview.pdf)
- **Routing:** keep `provider.require_parameters: true`; pin standard OpenAI first and
  Azure second while collecting data. OpenRouter marks reasoning as optional, default
  enabled at medium, and supports `none`, `low`, `medium`, `high`, `xhigh`, and `max`.
  Explicitly send `reasoning: { effort: "none" }` for the first latency trial rather
  than accepting the medium default. Then test `low` only if the hostile/date/state
  fixture gate needs it. Current Luna endpoints do not advertise `temperature`,
  `top_p`, or `stop`, so do not send those while `require_parameters` is enabled.
  OpenAI routes advertise `max_tokens`, while Azure advertises
  `max_completion_tokens`; verify the AI SDK's emitted request before depending on
  Azure fallback with an explicit output-token cap.
  [OpenRouter reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens),
  [OpenRouter Endpoints API](https://openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints)

**Promotion rule:** replace GPT-5.4 Mini as the closed fallback only if Luna at `none`
or `low` stays within the 2-second p95 target and beats it on exact prior-state identity,
hostile false negatives, relative dates, and `unhandled` classification. Keep Gemma 4
as the preferred open-weight default unless Luna's task-specific semantic gain is large
enough to justify abandoning the openness preference.

## Latest-model sweep

The shortlist was checked against models added to OpenRouter through 2026-07-10. None
of these newer names has enough current evidence to displace Gemma 4 or DeepSeek V4:

| Exact slug | Release / openness | Why it is not shortlisted |
|---|---|---|
| `nex-agi/nex-n2-mini` | 2026-06-24; open weights | Very promising and advertises structured output at $0.025/$0.10, but it has no usable OpenRouter latency/error history or independent IFBench/injection result yet. Watchlist, not production pick. [OpenRouter](https://openrouter.ai/nex-agi/nex-n2-mini) |
| `z-ai/glm-5.2` | 2026-06-16; model weights | Strong IFBench/Tau2 (73.3%/99.1%), but about 6.49-second best listed E2E and 1.36% best displayed structured-output error. [OpenRouter](https://openrouter.ai/z-ai/glm-5.2) |
| `qwen/qwen3.7-plus` | 2026-06-03; proprietary Plus model | About 2.50-second E2E and only 14 tok/s; first-party Qwen structured-output docs still center on JSON mode rather than strict direct schema. [OpenRouter](https://openrouter.ai/qwen/qwen3.7-plus/benchmarks) |
| `stepfun/step-3.7-flash` | 2026-05-28; open weights | About 8.63-second E2E and 4.71% structured-output errors on the route with history. [OpenRouter](https://openrouter.ai/stepfun/step-3.7-flash/performance) |
| `ibm-granite/granite-4.1-8b` | 2026-04-30; Apache 2.0 | Excellent 0.79-second E2E and $0.05/$0.10, but 2.15% structured errors and weak IFBench/Tau2 (38.6%/27.8%) make hostile/unhandled accuracy too risky. [OpenRouter](https://openrouter.ai/ibm-granite/granite-4.1-8b/api) |
| `tencent/hy3` | 2026-07-06; too new | Current paid route telemetry is unusably slow and the model lacks trustworthy independent reliability data. [OpenRouter](https://openrouter.ai/tencent/hy3) |
| `google/gemini-3.5-flash` | 2026-05-19; closed | Stronger model, but about 5.15-second E2E and 4.8% structured-output errors on AI Studio; it misses the interactive path. [OpenRouter](https://openrouter.ai/google/gemini-3.5-flash/performance) |

Also avoid retaining `deepseek/deepseek-chat` as the long-term default: DeepSeek says
the legacy chat/reasoner aliases currently map to V4 Flash modes and retire on
2026-07-24. Use the explicit `deepseek/deepseek-v4-flash` slug if choosing that family.
[DeepSeek V4 release](https://api-docs.deepseek.com/news/news260424/)

## OpenRouter and AI SDK gotchas

1. **Set `provider.require_parameters: true`.** The OpenRouter default is `false`;
   without it, a provider may receive the request while silently ignoring unsupported
   parameters such as `response_format`. This is mandatory for every provider-strict
   open model in the shortlist. [OpenRouter routing](https://openrouter.ai/docs/guides/routing/provider-selection)
2. **Pin or order the tested provider.** Model-level `supported_parameters` is an
   aggregate. For Gemma 4, DeepInfra advertises strict output but Cloudflare currently
   does not; for DeepSeek V4 and Haiku 4.5 the differences are larger. Check the live
   Endpoints API before changing routes.
3. **`Output.object` should remain direct response-schema mode.** In the installed
   `@openrouter/ai-sdk-provider` 2.10 line, an AI SDK schema is sent as
   `response_format.type = "json_schema"`, with `strict: true` by default. Do not
   mistake tool support for direct structured-output support.
   [OpenRouter AI SDK provider](https://github.com/OpenRouterTeam/ai-sdk-provider)
4. **`json_object` is only JSON mode.** It guarantees parseable JSON, not required
   fields, enum values, or no extras. If strict response schemas are unavailable, a
   forced tool call can be a fallback on a tool-capable backend, but it changes the
   integration contract and must be evaluated separately.
   [OpenRouter API modes](https://openrouter.ai/docs/api/reference/overview)
5. **Response Healing is not a semantic retry.** It repairs JSON syntax, markdown
   wrappers, trailing commas, and similar defects, adding negligible CPU latency. It
   does not repair schema adherence, impossible dates, prior-state drift, prompt
   injection, `unhandled` errors, or truncation.
   [OpenRouter Response Healing](https://openrouter.ai/docs/guides/features/plugins/response-healing),
   [scope clarification](https://openrouter.ai/announcements/response-healing-reduce-json-defects-by-80percent)
6. **Warm the stable schema.** OpenAI and Claude document extra processing/grammar
   compilation on the first request for a new schema. Keep the TripIntent schema and
   descriptions stable across calls and warm it after deploy.
7. **Refusals and token cutoffs can bypass a schema guarantee.** OpenAI and Claude both
   document refusal/incomplete cases that may not match the requested schema. Treat an
   upstream safety refusal as unchanged prior state or an explicit parse failure; do
   not retry it blindly as malformed JSON.
8. **Keep every property required and nullable.** Required plus `null`, with recursive
   `additionalProperties: false`, is the safe intersection across strict vendors and
   matches the repository's schema. Zod must still enforce real calendar dates,
   relative-date correctness, registry membership, and cross-field invariants.
9. **Do not mix quality and latency operating points.** Max/high-reasoning benchmark
   scores can add many seconds. Benchmark `none`, `minimal`, and `low` separately and
   select the lowest setting that passes the hostile/date/full-state fixture gate.

## Promotion test

Run the exact parser fixture set through these three first:

1. `google/gemma-4-26b-a4b-it` on DeepInfra with strict-parameter routing;
2. `deepseek/deepseek-v4-flash` on a pinned schema-capable provider;
3. `openai/gpt-5.4-mini` on OpenAI as the closed control.

Add `openai/gpt-5.6-luna` on standard OpenAI as a fourth launch-day canary, testing
`reasoning.effort = "none"` first and `"low"` second. Do not test Luna Pro or max/high
reasoning on the interactive promotion path.

Use at least five repetitions per fixture and record p50/p95 total latency, first-pass
Zod success, retry rate, exact untouched-field equality, relative-date accuracy,
hostile false negatives, and `unhandled` exact/semantic accuracy. Promote Gemma if it
matches the GPT control on all semantic gates; otherwise use GPT-5.4 Mini and retain
Gemma/DeepSeek as cost experiments.
