# Country destinations resolve in the engine as flagged assumptions

"I'm going to Japan" used to dead-end in a destination prompt chip. Now it fills
"To: Tokyo (assumed)" and searches immediately. The mechanism: the parser emits the
*country* the user said (from a closed list — the keys of a new country table in the
place registry), and the engine resolves country → primary city and sets the
destination's `assumed` flag. Picking Tokyo over Osaka is a genuine guess about the
user, so it gets the assumption treatment ADR 0004 reserves for those — not the
unflagged bare-city → primary-airport treatment.

## Considered options

- **Parser resolves Japan → NRT itself and sets `assumed`.** Rejected: it puts a
  guess inside the LLM boundary and breaks "only the engine creates an assumption."
  A fixture couldn't distinguish "model followed the mapping" from "model hallucinated
  Tokyo." The parser translates what the user said; the engine decides.
- **Resolve by registry order** (first entry in the country), extending "registry
  order is policy." Rejected: it overloads one ordering with two meanings — Germany
  would resolve to Frankfurt because FRA precedes MUC and BER for airport reasons.
  The primary city per country is a product judgment ("where people actually want to
  go") and deserves an explicit, reviewable table entry. The table is versioned with
  `PLACES_VERSION`.
- **Treat "Japan" as a destination theme** (status quo, ADR 0005). Rejected as too
  passive: a country is a stated, resolvable destination, not a vague invitation to
  explore.

## Scope (the explicit no-s)

Strictly country-level. Regions ("Asia", "Europe", "Scandinavia") remain destination
themes — a region → city guess is a wilder leap and belongs to phase-2 exploratory
search. A country with no registry coverage (Brazil) takes the existing
unsupported-place path (unhandled echo + prompt chip). The US is deliberately absent
from the table.

## Consequences

- `destination` grows an `assumed` flag (previously origin-only); the parser must be
  able to emit a country-level destination and must preserve a resolved assumed
  destination byte-for-byte on re-emission, as it already does for origin.
- An assumed destination is searchable immediately — fill-and-flag, like origin.
  Requiring confirmation first would invent a third chip state (a pre-filled prompt
  chip) and restore the friction this removes.
- Editing or confirming the destination chip clears the flag, mirroring origin.
