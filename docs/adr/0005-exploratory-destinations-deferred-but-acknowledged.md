# Exploratory destinations: no theme search in MVP, but the theme is acknowledged

The PRD showcases "somewhere warm in march, cheap" as proof the product accepts natural
phrasing. "Somewhere warm" is a deliberately vague destination — an invitation to
explore — but the pipeline treats a null destination as a *missing* field to correct (see
[D5 in ROADMAP.md](../../ROADMAP.md)). D1 and D2 already improved this: "in march" → dates,
"cheap" → `priority`, and "somewhere warm" is captured in `unhandled` rather than dropped.

## Decision

- **No theme→destination search in MVP.** Mapping "warm in march" to candidate places is
  phase-2 exploratory search. The current 7-city registry (Chicago, SF, New York, Tokyo,
  Lisbon, London, Paris) is temperate — there is essentially nothing "warm" to resolve
  to, so building theme resolution now would be both real scope and unconvincing.
- **But don't dismiss the theme.** When the destination is missing AND a clause went
  `unhandled`, the missing-destination follow-up **absorbs** the echo — one question that
  acknowledges what we couldn't use and asks where to go — instead of firing a blunt
  "Where do you want to fly to?" and hiding the captured theme behind the block. This
  refines the D2 ordering ([docs/adr/0002](0002-unhandled-clauses-and-the-number-provenance-carve-out.md)):
  the notice doesn't merely wait behind the blocker, it is folded into the blocker's
  question when both coincide.

## Why this shape

- **Serves the marquee example honestly.** The demo shows March + Cheapest chips appear
  and the system says, in effect, "I couldn't use 'somewhere warm' — and I still need a
  destination. Where would you like to fly?" It understood everything it could and is
  candid about the one thing it can't. That is the product thesis, not a failure.
- **Cheap.** No new schema, no theme model — a `checkGaps` copy refinement echoing the
  already-captured `unhandled` (deterministic template + the user's own words, same
  echo-only rule as the notice).

## Considered and rejected

- **Add `destinationTheme` state + engine resolution now.** Rejected: real scope, and the
  registry can't support a convincing "warm" result set. Phase 2.
- **Ratify but keep the follow-up blunt.** Rejected: leaves the PRD's headline example
  demoing as a shrug and hides the captured theme.

## Known limitation (phase-2 polish)

The absorbed follow-up echoes the clause generically ("I couldn't use X"). It does not
distinguish a destination-theme ("somewhere warm") from an unrelated unsupported
constraint ("exactly one connection"), because `unhandled` is a single opaque string.
Theme-specific copy would need the parser to separate the two — deferred with exploratory
search.
