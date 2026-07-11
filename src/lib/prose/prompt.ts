import type { ExplanationFacts } from '../engine/types'
import { renderFacts } from './render'

export function buildSystemPrompt(): string {
  return `Write one or two short sentences (about 160 characters or less) explaining why this flight result stands out on a results card. Use an expert-friend tone: plainly confident, with no marketing fluff or exclamation marks.

Use only the numeric renderings provided, quoted verbatim. Never invent, convert, round, or approximate a number. Do not use percentages or vague quantities such as "a couple" or "about half". Pick the one to three most decision-relevant facts instead of enumerating everything. Mention the arrive-by deadline only when it sharpens the point.

Example input:
stops: 1 stop
duration: 16h 40m
price: 98,000 miles + $112 (Aurora Award)
badges: cheapest
vs fastest: 1 more stop; 3h 25m slower; arrives 3h 25m later; 41,000 fewer miles

Example output:
The cheapest option here — one stop and 3h 25m slower than the fastest, but it saves 41,000 miles.`
}

export function buildUserMessage(facts: ExplanationFacts): string {
  return renderFacts(facts)
}
