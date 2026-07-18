# Product

## Register

product

## Platform

web

## Users

Anyone who books their own flights and has ever opened four tabs to answer one question. No points expertise required or assumed; the product should feel as natural to a first-time flyer as to a road warrior — the difference is only in how demanding their requests get. They arrive with a trip in their head expressed in human terms ("get me and my wife to Tokyo in business, sometime in February") and want an answer without translating it into dropdowns and IATA codes.

## Product Purpose

Rota is conversational flight search that shows its work, running on simulated availability (a deliberate, labeled scope decision). Natural language in, visible structure out: the user talks, the search updates, and every interpretation renders as editable chips. Success is a first-time viewer understanding the product within one query, a lazy query streaming its first result in under 3 seconds, and a three-utterance refinement journey where every chip change is visible and every re-rank is legible.

## Product Scope

Rota is a responsive web demo for one-way, cash-priced flight search over labeled simulated inventory. It does not book travel or provide real availability, and it does not include accounts, alerts, hotels, cars, or native clients. The structured trip intent is the product state; conversation is only an input method and is never retained as a transcript.

## Positioning

Flight search you can talk to that never hides what it understood — the conversation edits the search, the structure earns the trust.

## Brand Personality

Calm, minimal, neutral. A quiet instrument that stays out of the way; the results are the personality. The interface never performs — no theater around the AI, no urgency, no noise. Confidence is expressed through legibility and speed, not decoration.

## Anti-references

- Chatbot UI: no chat bubbles, no scrolling transcript, no "assistant is typing" theater. The black-box chat pattern is the thing this product exists to replace.
- Legacy OTA clutter: no Kayak/Expedia-style filter walls, banner noise, urgency badges, or cramped result rows.
- Generic AI-product gloss: no sparkle icons, purple gradients, "magic" framing, or glassmorphism.

## Design Principles

1. **Show the work.** Every interpretation of the user's words is visible, structured, and editable. Nothing the system understood is ever buried or implicit.
2. **The interface disappears into the trip.** Calm surfaces, restrained color, familiar affordances. Attention belongs to the chips and results, never to the chrome.
3. **State over history.** The chips are the source of truth; conversation is just the fastest way to edit them. Design for legible state change, not accumulating transcript.
4. **Speed should feel alive.** Results stream, re-rank, and settle progressively. Motion exists to convey state change — arrivals, re-ranks, chip edits — never decoration.
5. **Honest by construction.** Simulated data is labeled, every prose claim traces to a computed fact, and the UI never implies certainty it doesn't have.

## Accessibility & Inclusion

WCAG 2.2 AA: ≥4.5:1 body-text contrast, full keyboard operability, visible focus, and `prefers-reduced-motion` alternatives for all animation — including the streaming/re-ranking choreography, which must degrade to instant or crossfade updates.
