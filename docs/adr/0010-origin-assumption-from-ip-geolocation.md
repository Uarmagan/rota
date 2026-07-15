# The origin assumption comes from IP geolocation, not a hardcoded Chicago

The origin candidate that `fillAssumptions` flags "(assumed)" was a hardcoded
constant (`ORD` in `src/app/api/deps.ts`). Now the API route reads the hosting
platform's IP geolocation headers (`x-vercel-ip-latitude` / `-longitude`), resolves
them to a supported place, and builds a per-request `NormalizeConfig`. Chicago remains
the fallback when no location headers arrive (dev, previews, geo-less requests), so
pinned-context fixtures are unaffected.

## Resolution policy

Nearest supported **city**, primary airport: haversine from the IP coordinates to the
registry airports (coordinates already live in the availability layer), snap to the
nearest airport's *city*, then resolve city → primary airport by the existing
registry-order rule. The snap matters — a south-side Chicago IP shouldn't get MDW just
because Midway is geometrically closer; location-derived origin is morally a "bare
city," and bare city → primary airport is settled policy. No distance cap: for a
visitor far from any covered metro, the nearest hub is still the least-wrong guess,
and the "(assumed)" flag exists precisely because the guess can be wrong.

## Considered options

- **Browser Geolocation API.** Rejected: precise, but it fires a permission prompt on
  the landing page — directly against the quiet, non-interrupting posture (the product
  bans banners and consent prompts for far less) — and needs client→server plumbing
  for a value only needed approximately. Do not re-propose this without revisiting the
  quiet-notice ethos.
- **Timezone heuristic** (`Intl` timezone → city). Rejected: no prompt, but
  `America/Chicago` spans North Dakota to Texas — barely better than the constant.
- **Exact city-name match** on `x-vercel-ip-city`. Rejected: only helps visitors
  physically inside the ~20 covered metros; everyone else silently gets Chicago again,
  which was the complaint.

## Boundaries and privacy

The resolver is a pure server-layer function (headers + airport coordinates → Place);
the engine is untouched and still the sole creator of the assumption — the server
merely nominates the candidate, as the hardcoded constant did before. The engine
cannot host the lookup anyway: it may import only zod/schema/engine, and airport
coordinates live in the availability layer. The location is used in-request and never
stored; the Quiet privacy notice discloses the prefill in one line (see the
Anonymous visit and Origin geolocation entries in CONTEXT.md).
