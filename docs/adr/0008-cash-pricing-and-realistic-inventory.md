# Cash pricing and realistic simulated inventory

The original seven-airport, points-priced inventory made the demo's deterministic
architecture clear, but it did not read like a credible flight search. Common airports
were unknown, fictional reward programs distracted from comparison, and a small route
table limited the generator's reach. Demo credibility now matters more than retaining
the original points flavor.

## Decision

- Pricing is cash only. Availability emits a whole-dollar per-traveler fare, and the
  engine computes party totals and comparison deltas.
- The place registry covers 63 airports. For cities with multiple airports, registry
  order resolves a bare city name while a specific airport name or IATA code resolves
  that airport. No metro-code type is added to `TripIntent`.
- Simulated flights carry real airline names, prefixes, and plausible flight numbers.
  These identities are deterministic fiction. The UI must persistently label the data
  as simulated, and no fare or inventory claim is made about a real carrier.
- Airport coordinates drive haversine distance and block duration. Static per-airport
  UTC offsets preserve local wall-clock segment times without downstream timezone math.

## Why

- Cash creates one legible price scalar for ranking and comparison.
- A broad registry makes ordinary search language work without changing the frozen
  place schema.
- Real carrier identities and geometry-derived durations make generated rows familiar
  while keeping the inventory explicitly simulated and reproducible.
- Registry synchronization, seeded generation, and the number-provenance guard keep
  the architecture's testable trust boundaries intact.

## Considered and rejected

- **Cash plus points.** Two price scalars obscure ranking and make comparisons harder
  to explain.
- **Metro codes.** Correct for a production search engine, but still disproportionate
  to this demo and incompatible with the frozen place shape.
- **Fictional airlines.** They undercut the realism this pivot exists to create. Real
  identities are acceptable only with persistent simulated-data disclosure.
