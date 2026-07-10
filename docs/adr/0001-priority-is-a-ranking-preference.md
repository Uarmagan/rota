# `priority` is a top-level ranking preference, not a filter or a constraint

The PRD accepts utterances like "somewhere warm in march, cheap", but the schema had
nowhere to hold a price/speed preference. We added a top-level
`priority: 'cheapest' | 'fastest' | null` (see [D1 in ROADMAP.md](../../ROADMAP.md)).

## Decision

- **A ranking preference, never a filter.** `priority` reweights the scoring blend in
  `rank.ts`; it never removes a result. "Cheap" carries no number, and the
  number-provenance invariant forbids the model inventing a threshold to filter
  against, so a `maxPrice`-style filter is impossible from this input anyway. A
  preference needs no number — the engine already has every result's computed price.
- **Top-level, not inside `constraints`.** Two reasons. (1) A constraint here is
  tri-state (null / value / `false` = explicitly waived); `priority` has no coherent
  `false` ("prefer expensive" is nonsense), so it fails the test that defines
  constraint membership. (2) A constraint gates (or can gate) the result set; `priority`
  never does. Keeping it out of `constraints` keeps that bucket meaning "things that
  gate or could gate results."
- **A single enum, not two independent flags.** "Cheapest" and "fastest" genuinely
  conflict. One axis makes "cheap AND fast" unrepresentable by construction, so the
  gap-checker never has to adjudicate that contradiction.

## Considered and rejected

- **`maxPrice` budget filter** — requires a user-stated number no PRD utterance
  provides, and drags empty-result/follow-up policy into scope. A coherent phase-2
  feature, not this.
- **`preferCheapest: boolean | null`** — price-only; its `false` state is meaningless,
  and "fastest" (an equally common utterance) would have nowhere to go.
- **Inside `constraints` for consistency with `nonstop: 'preferred'`** — `nonstop`
  lives there because its `required` sibling is a real filter; `priority` has no
  filtering sibling and flunks the tri-state test.

A future reader will be tempted to fold `priority` into `constraints` or turn it into a
budget filter. Both were considered and rejected for the reasons above.
