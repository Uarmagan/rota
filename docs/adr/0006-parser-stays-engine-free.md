# Parser stays engine-free and returns raw ParseResult

The parser must decide whether model output deserves its one feedback retry, while the
engine must remain the sole owner of normalization. Unknown place codes sit at that
boundary: they are valid schema shapes but invalid registry members.

## Decision

The parser returns a raw, pre-canonicalization `ParseResult`. It checks origin and
destination IATA membership directly against `schema/places.ts` and retries model
mistakes without importing engine. The pipeline still calls engine
`canonicalizePlaces`, which replaces model-authored labels with canonical registry
labels and defensively asserts the membership invariant.

Engine owns all normalization.

## Why this shape

- **One retry owner.** Invalid JSON, date refinements, and unknown IATA codes are all
  model mistakes, so their feedback retry lives in one parser adapter.
- **A thin, swappable adapter.** Parser depends on LLM packages and shared schema, not
  deterministic core behavior.
- **Two contracts, one small lookup.** Duplicating a seven-entry registry membership
  check is deliberate. Parser asks “should I retry?”; engine asks “can I relabel this
  input and assert the pipeline invariant?” Those are different responsibilities.
- **Executable boundary.** The import guard rejects parser-to-engine imports outside
  tests, so the decision is enforced rather than conventional.

## Considered and rejected

- **Parser imports `canonicalizePlaces`.** Rejected because it couples the LLM adapter
  to the deterministic core and pulls normalization into the parser.
- **Pipeline retries `UnknownPlaceError`.** Rejected because it splits model retry
  policy across parser and orchestration, leaving no single owner for model mistakes.
