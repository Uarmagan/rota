# Rota

**Conversational flight search that shows its work.**
Product Requirements Document, v0.2
Status: Draft
Owner: Ugur Armagan

---

## One-liner

Rota lets you search for flights the way you'd describe them to a person, and it never hides what it understood. You talk, the search updates, and every interpretation stays visible and editable.

## Why this exists

Flight search hasn't changed in twenty years: a wall of dropdowns, date pickers, and filter checkboxes that force you to translate your trip into the machine's language. People don't think in IATA codes and filter panels. They think "get me and my wife to Tokyo in business, sometime in February, nothing brutal on layovers."

The obvious fix, a chatbot, usually makes it worse. Chat interfaces bury the machine's interpretation inside conversation history where you can't inspect or correct it. You end up negotiating with a black box.

Rota's bet is that the right interface is both: natural language in, visible structure out. The conversation is how you edit the search. The structure is how you trust it.

This is a demo product running on simulated availability, and that's a deliberate, labeled scope decision. Everything downstream of availability (parsing, refinement, ranking, explanation) is real.

## Who it's for

Anyone who books their own flights and has ever opened four tabs to answer one question. No points expertise required or assumed. The product should feel as natural to a first-time flyer as to a road warrior; the difference is only in how demanding their requests get.

## Product principles

Behavioral rules, not tech choices. Every feature is downstream of these.

1. **The AI never silently decides.** Every interpretation of your words renders as editable, structured facts. You can always see what it understood and correct it in one tap.
2. **The AI interprets, the engine computes.** Language models turn words into structure and structure into prose. Every number, price, ranking, and result on screen comes from deterministic logic. No exceptions, and this is checkable.
3. **Conversation edits state, it doesn't accumulate history.** A follow-up like "actually make it nonstop" doesn't append to a chat log. It changes a chip, and the change is visible. The chips are the source of truth; the conversation is just the fastest way to edit them.
4. **Speed should feel alive.** Results stream in progressively and re-rank as they land. Partial answers now beat complete answers later.

## MVP scope

### 1. Natural language search

A single input that accepts how people actually type: "business class to tokyo in february for 2", "tokyo feb", "somewhere warm in march, cheap". No traditional search form. The intent chips are the structured fallback.

Note on "somewhere warm": MVP parses everything resolvable (dates → March, price lean → cheapest) and *acknowledges* the vague part rather than resolving it — it captures "somewhere warm" and folds it into a single follow-up asking for a destination, instead of silently treating the field as blank. Turning a theme like "warm" into candidate destinations (exploratory search) is phase 2; the current registry has no warm places to resolve to. See docs/adr/0005.

### 2. Intent chips

The parsed request renders as a row of editable chips: travelers, route, cabin, dates and flexibility, constraints (nonstop, arrive-by, avoid red-eyes). Tap any chip to correct it without retyping.

Ambiguity handling, two modes:

- **Stated assumption** for low-risk gaps: the chip is filled and labeled ("From: Chicago (assumed)"). One tap to change.
- **One targeted follow-up** for high-risk gaps (no destination, contradictory constraints). Never a wall of questions.

### 3. Conversational refinement

The signature interaction. After results appear, the user keeps talking: "actually business class", "nothing before 9am", "what about the following week". Each utterance is parsed against the current chip state, the affected chips visibly update, and results re-stream. Refinements can add, change, or remove constraints ("forget the nonstop thing").

The test for this feature: a user should be able to go from lazy first query to their actual trip in three utterances without ever touching a form control, while never once wondering what the system thinks they asked for.

### 4. Streaming results

Results stream in grouped by (simulated) source as each responds. Skeleton states, arrival animation, and live re-ranking of the "best match" badge are part of the product. Results carry whole-dollar simulated cash fares alongside duration, stops, times, and realistic airline identities, making comparison read like a familiar flight-search product without asserting live inventory or prices.

### 5. "Why this result"

Each top result gets a one-or-two-line explanation generated strictly from computed facts, comparing within the result set: "Fastest option under your arrive-by constraint. One more stop than the cheapest, but lands 6 hours earlier." If the engine didn't compute it, the explanation can't say it (principle #2).

### 6. Parser fixture set

A committed set of 20 to 25 test utterances with expected parsed outputs: happy path, lazy phrasing, typos, relative dates, refinements against existing state, and hostile input designed to break it. The parser is the product's core surface, so its accuracy is a product requirement. Refinement utterances (parse-against-state) are first-class fixtures, not an afterthought.

## Explicitly out of scope (MVP)

**The entire points-intelligence layer: wallet, balances, transfer paths, portal comparisons, cents-per-point, booking steps.** Reason: these features assert real, checkable facts about transfer ratios, bonuses, and valuations. Simulated availability is honest because it's labeled fake; a wrong transfer ratio is just wrong. That layer deserves real data and real domain rigor, so it's phase 2, not a worse version in MVP.

Also out:

- Real flight availability (simulated, with realistic shape: scarce premium cabins, variable pricing)
- Round-trip and multi-city (one-way only, mirroring real MVP sequencing)
- Accounts, auth, saved searches, alerts
- Full eval harness with accuracy reporting (phase 2, built on the fixture set)
- Hotels, cars, anything that isn't a flight
- Mobile-native anything (responsive web only)

## The demo path

One narrative, end to end, under 60 seconds:

1. Type a lazy query with a missing detail ("tokyo in feb for 2").
2. Chips appear. One carries a labeled assumption (origin). Results are already streaming underneath.
3. Say "actually business class, and nonstop if possible." Two chips visibly change. Results re-stream and the best-match badge moves.
4. Say "nothing that lands after midnight." A constraint chip appears, the list re-ranks.
5. Open the top result. The "why this result" line explains the ranking using only facts visible on the card.

If a feature doesn't make these 60 seconds better, it waits.

## Success criteria

- A first-time viewer understands the product within one query, no narration.
- Lazy query to first streamed result in under 3 seconds.
- The three-utterance refinement journey works flawlessly: every chip change is visible, every re-rank is legible.
- The parser passes the full fixture set, including refinement-against-state cases, and degrades gracefully (assumption or single follow-up) on the ones built to break it.
- Zero numbers on screen are LLM-generated. Checkable, and checked.

## Open questions

- Whether the simulated inventory should eventually link to a real availability provider. Current answer: not until the labeled fiction can be replaced end to end.
- Whether refinement input is the same box as initial search or a docked follow-up bar. Current lean: same box, it reinforces "one way in."
- Tone of "why this result" copy: expert-friend vs neutral-tool. Current lean: expert-friend.
- Phase 2 ordering: points-intelligence layer vs eval harness first. Genuinely undecided, and a good conversation to have with people who know the points data cold.
