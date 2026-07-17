# Public demo security operations

This runbook separates Rota's repository contract from the live Vercel controls that
must exist before hosted paid routes are enabled. Repository tests cannot prove live
external state.

## Live inventory

This repository-only change did not inspect or mutate the Vercel project.

| Item | State |
|---|---|
| `verified_at` | not yet verified |
| Project, team, and public domains | not yet verified |
| Environment scope with paid provider credentials | not yet verified; inspect presence and scope only, never values |
| Network topology and any proxy before Vercel | not yet verified |
| Plan and current WAF pricing acceptance | not yet verified |
| Existing rules and rule capacity | not yet verified |
| Conflict with `rota-paid-api-visitor` | not yet verified |
| Preview protection and public paid preview access | not yet verified |
| Automatic Vercel system environment exposure | not yet verified |
| `ROTA_PAID_RATE_LIMIT_CONFIGURED` state | not yet configured or verified |
| `ROTA_TRUST_FORWARDED_ADDRESS` state | not yet verified |
| Authoritative forwarded visitor address | not yet verified |
| Provider billing controls | not yet verified; this is a separate residual-risk layer |

Before any release, an operator must complete this inventory read-only and record a
real timestamp, environment scope, topology, rule capacity, pricing acceptance, and
either no instrument conflict or the exact non-secret conflict. Stop if a proxy keeps
Vercel from seeing an authoritative visitor IP, a paid public preview cannot receive
the same control, the instrument ID conflicts, or no safe rate-limit slot remains.

## Allowance policy and exact rule

The intended policy is one combined allowance of 20 valid paid requests per IP in one
600-second fixed window. `/api/parse` and `/api/explain` share the same instrument so
either kind of paid model call consumes the same allowance. `/api/search` uses
simulated inventory and must use no paid-request instrument; Plan 011 reserves a
separate search control and its own counter.

The live rule contract is exact:

- Condition: `@vercel/firewall` SDK instrument
- Rate-limit ID: `rota-paid-api-visitor`
- Algorithm: fixed window
- Window: 600 seconds
- Limit: 20
- Counting key: IP, using the request default with no custom `rateLimitKey`
- Action: rate limited / 429
- Scope: every production or preview environment able to reach a paid model credential

Vercel's current documentation says SDK rate-limit counters are tracked per region.
Traffic for the same IP that matches in multiple regions can therefore exceed the
configured limit. This is a known residual risk, not durable person identity or a
globally strict quota, and must be accepted explicitly during live approval.

## Admission order

Each paid route applies the same six layers:

1. Paid browser/media boundary.
2. Bounded JSON body read.
3. Transport-schema validation.
4. Per-process concurrency and short-window gate.
5. Shared Vercel Firewall SDK check inside the local permit's `try/finally`.
6. Paid parser or explainer call.

Cross-site, unsupported-media, malformed, oversized, schema-invalid, and locally
rejected requests stop before the shared allowance. A shared rejection returns the
stable `{ "error": "rate_limited" }` 429 body without `Retry-After`, because the SDK
does not supply an authoritative reset duration. SDK exceptions, malformed/error
results, missing attestation, and unknown production environments fail closed with the
detail-free `{ "error": "service_unavailable" }` 503 response before model work.
Local gate 429 responses retain their known `Retry-After` value.

## Deployment sequencing and approval gates

`ROTA_PAID_RATE_LIMIT_CONFIGURED=true` is a non-secret deployment attestation. It
prevents application code from calling a rule that the operator has not deliberately
configured, but it cannot detect later rule deletion or drift.

Obtain separate explicit operator approval for all of the following before mutation:

- Current WAF price and one rule-slot use.
- The exact rule and every paid environment in scope.
- Enabling automatic Vercel system environment variables if `VERCEL=1` is unavailable.
- Setting the attestation in each approved environment.
- Setting `ROTA_TRUST_FORWARDED_ADDRESS=true`, only after direct authoritative Vercel
  ingress is proven.
- Push/PR/merge/deploy mechanics beyond the repository PR, the required redeploy, and
  one ordinary paid smoke request.

After approval, create and publish the exact WAF rule first. Then expose Vercel system
variables if required, set the attestation, apply any separately approved forwarded-
address setting, and redeploy the reviewed commit. Never use the attestation alone to
infer Vercel deployment from a hostname or caller-controlled header.

## Identity and network limitations

The WAF bucket is IP-scoped, not person-scoped. NAT and shared networks can group many
visitors into one allowance, while IPv6 privacy-address rotation and multi-region
counting can weaken enforcement. Do not add cookies, fingerprinting, accounts, or a
durable visitor profile to compensate.

`ROTA_TRUST_FORWARDED_ADDRESS` affects only the per-process fallback gate. Keep it
false unless read-only topology inspection proves the application receives direct
Vercel ingress and Vercel authoritatively overwrites the forwarded address. The shared
WAF rule owns IP counting independently.

## Verification and monitoring

After deployment, verify without a saturation test:

- The Firewall view shows the exact ID, IP key, fixed-window algorithm, 20 limit, and
  600-second window in every paid environment.
- Both paid routes call the same instrument and search calls none.
- One separately approved ordinary paid request reaches the model and creates an event
  for the exact instrument.
- A safe configuration check proves missing attestation fails closed before model
  work.
- The inventory above has a real `verified_at` value, topology, environment scope,
  current pricing acceptance, and remaining rule capacity.

Monitor the rule's continued presence, settings, scope, and events. Alert on missing
or changed configuration and on sustained 429 or 503 responses. Re-run the inventory
whenever routes, domains, paid credential scope, preview protection, hosting topology,
or pricing changes. A temporary low threshold or 21-request saturation run is not a
normal verification step and requires separate approval because it changes live state
or spends model calls.

## Disable and rollback

To stop paid traffic safely, remove or set the attestation away from exact `true` and
redeploy; hosted paid routes then fail closed with 503. Do not delete or disable the WAF
rule first while an attested deployment is still serving. After traffic is fail closed,
an operator may disable the live rule or roll back application code through the normal
approved release process. Re-enabling reverses the sequence: verify or create the rule,
verify scope and system variables, set the attestation, redeploy, perform one approved
ordinary smoke request, and update `verified_at`.

## Plan 011 reservation

Plan 011 owns search-stream throttling and must use separate counters. Record remaining
rule capacity here during the live inventory before choosing that control. The paid
instrument must remain exclusive to `/api/parse` and `/api/explain`.
