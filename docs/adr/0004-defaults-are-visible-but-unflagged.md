# Unstated cabin/travelers are filled as visible chips, but only origin is flagged "assumed"

`origin` carries an `assumed` flag and renders as "From: Chicago (assumed)". Unstated
`cabin` and `travelers` were slated to default silently at search time (economy, 1) with
no chip — a direct conflict with product principle #1, "the AI never silently decides"
(see [D4 in ROADMAP.md](../../ROADMAP.md)). The M2 engine that would apply those defaults
does not exist yet, so this is settled before it is built.

## Decision

Model three states for a field, not two:

- **Stated** — the user said it; plain chip.
- **Assumed** — a risky guess about the user (currently origin only); filled AND flagged
  "(assumed)", one-tap-editable, confirmation clears the flag.
- **Defaulted** — a safe near-universal fallback (cabin → economy, travelers → 1); filled
  in normalization and rendered as a plain, editable chip, but **not** flagged.

Principle #1 is satisfied by the **chip** (visible + editable), which every filled field
gets. The **"(assumed)" label** is a stronger affordance reserved for genuine guesses,
not stamped on conventions.

## Why not generalize the `assumed` flag to cabin/travelers

- **It dilutes the signal.** If every filled field says "(assumed)", the label stops
  meaning "you should really check this." Origin is worth flagging *because* it's the one
  people care about; economy / 1-traveler are conventions, not guesses about the user.
- **Chip-row clutter** for fields users rarely revisit.
- **Schema cost.** `cabin` and `travelers` would each have to become an object carrying
  its value plus an `assumed` flag (like `originSchema`), rippling through the parser
  schema, the diff, and every fixture — right as the schema is meant to freeze. Option B
  needs no new field types; it only fills more in normalization.

## Reversal path

If users are confused by an unexplained default, escalate a specific field from
"defaulted" to "assumed" (add the flag, show the label). The escalation is per-field and
additive — easy to do later, hard to walk back if over-applied now. Start conservative.
