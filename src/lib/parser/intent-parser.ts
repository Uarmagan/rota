import type { ParseResult, Place, TripIntent } from '../schema/trip-intent'

export interface ParserContext {
  today: string
  supportedPlaces: readonly Place[]
}

export interface IntentParser {
  parse(currentIntent: TripIntent, utterance: string): Promise<ParseResult>
}

export class ParserError extends Error {
  constructor(
    readonly reason: 'invalid_output' | 'transport' | 'budget_exhausted',
    message: string,
  ) {
    super(message)
    this.name = 'ParserError'
  }
}
