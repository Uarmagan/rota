# Thin search stream and fail-safe prose

Availability arrives incrementally, while ranking must react immediately to both new
batches and local chip edits. Why-this-result copy is decorative but still sits behind
the product's load-bearing rule that no displayed number may originate from a model.

## Decision

- `GET /api/search` streams raw `SourceBatch` values. The client runs filter, rank,
  best-match selection, and `ExplanationFacts` computation with the isomorphic engine,
  then posts facts for top results to `POST /api/explain`.
- Prose never feedback-retries. A failed call, empty or oversized output, or
  number-provenance violation falls immediately to a deterministic template.
- The provenance allowlist includes code-derived display decompositions of engine
  values, including hours/minutes and 12-hour clock forms.

## Why this shape

- **One ranking owner.** The client already holds live intent and accumulated batches,
  so local engine computation keeps chip edits and incoming results instant and avoids
  duplicating state on the server.
- **Cheap streaming.** The search route transports availability only. Prose receives
  one minimal, schema-gated facts shape through its own route.
- **Fail-safe flourish.** Parsing blocks the product and earns a feedback retry; prose
  does not. Its deterministic fallback is already correct and guard-clean.
- **Derived values preserve provenance.** Converting an engine duration into its hour
  and minute display values is deterministic code, not a model-authored fact.

## Considered and rejected

- **Server-side rank and facts enrichment in the stream.** Rejected because it
  duplicates client state, prevents instant local re-ranking, and contradicts the
  isomorphic-engine design.
- **A prose feedback retry.** Rejected because it adds latency for decorative copy when
  a correct fallback is already available.
- **Spelled-number compound parsing in the guard.** Rejected as complexity without
  payoff. The prompt mandates digit renderings; compounds safely fall back.
