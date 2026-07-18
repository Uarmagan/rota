# `unhandled` clauses live beside TripIntent, with a sanctioned number-provenance carve-out

The schema expresses a fixed vocabulary; users say things outside it ("exactly one
connection", "window seat"). Silently dropping those clauses violates product principle
#1 ("the AI never silently decides"), and a dropped clause leaves no trace for the
engine to react to. So the parser now emits `unhandled` for recognized-but-unsupported
clauses.

## Decision

- **Beside TripIntent, not on it.** The parser returns
  `ParseResult { intent: TripIntent; unhandled: string | null }`. `unhandled` is
  transient (fresh per utterance, never persisted — the opposite of full-state
  re-emission), it is not a chip, and it is not diffed. Putting it on TripIntent would
  broaden a crisp definition ("the complete structured description of the trip") and
  invite a field with inverted persistence rules into a "re-emit complete state" object.
- **Scope: recognized-but-unsupported only.** Parse failures (a typo'd date) take the
  Zod-gate → feedback-retry path. `unhandled` means "I understood these words and
  genuinely cannot represent them," not "I failed to parse."
- **Single `string | null`, echo-only.** The consumer is one deterministic follow-up
  ("never a wall of questions"), so a list buys nothing. The text quotes the user's own
  clause back, readably formatted, introducing no new numbers or facts.
- **Non-blocking.** `GapOutcome` gains `ready_with_notice`: if the intent is otherwise
  searchable, results stream AND the echo line renders (principle #4, partial answers
  now). Missing destination remains a hard blocker and is adjudicated first;
  `checkGaps(intent, unhandled)` decides both. (Refined by
  [docs/adr/0005](0005-exploratory-destinations-deferred-but-acknowledged.md): when
  destination is also missing, the follow-up *absorbs* the echo rather than deferring it.)

## The number-provenance carve-out (why this needs recording)

The invariant is "no number a user sees originates from an LLM." `unhandled` is
model-authored text shown directly on screen — the first and only place parser text
reaches the UI (even the parser's city labels are discarded by canonicalization) — and
it can contain a number ("couldn't apply: exactly 1 connection").

We accept this under one constraint: **`unhandled` may only echo/quote the user's own
clause, never introduce new specifics.** The number's provenance is then the *user*,
not the model — a mirror, not a claim — so the invariant's spirit (the model never
*originates* a fact-number) holds. This is a narrow carve-out, **not** a precedent: it
does not license the model to phrase any figure it wasn't handed by the user. The guard
elsewhere stays absolute. Recorded so a future reader neither "fixes" this exception nor
cites it to loosen the guard.
