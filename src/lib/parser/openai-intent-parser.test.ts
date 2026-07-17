import { APICallError } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PLACE_AIRPORT_ALIASES,
  SUPPORTED_PLACES,
  airportAliasesForPlaces,
} from '../schema/places'
import {
  createEmptyTripIntent,
  type ParseResult,
} from '../schema/trip-intent'
import { ParserError } from './intent-parser'
import { OpenAIIntentParser } from './openai-intent-parser'
import { PARSER_FEEDBACK_FRAGMENT_MAX_UNITS } from './parser-feedback'
import { buildSystemPrompt } from './prompt'
import { parserEvaluationCases } from './fixtures'

const openaiMock = vi.hoisted(() => ({
  model: undefined as MockLanguageModelV3 | undefined,
}))

vi.mock('@ai-sdk/openai', () => ({
  openai: () => {
    if (!openaiMock.model) throw new Error('mock model was not configured')
    return openaiMock.model
  },
}))

const context = {
  today: '2026-07-09',
  supportedPlaces: SUPPORTED_PLACES,
  airportAliases: airportAliasesForPlaces(SUPPORTED_PLACES),
}

const validResult: ParseResult = {
  intent: {
    ...createEmptyTripIntent(),
    destination: { iata: 'NRT', city: 'Tokyo', assumed: false },
  },
  unhandled: null,
}

describe('OpenAIIntentParser', () => {
  beforeEach(() => {
    openaiMock.model = undefined
  })

  it('returns a valid complete parse result', async () => {
    const model = mockModel([modelResult(validResult)])
    openaiMock.model = model

    const result = await new OpenAIIntentParser(context).parse(
      createEmptyTripIntent(),
      'to tokyo',
    )

    expect(result).toEqual(validResult)
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('caps every parser generation at 1,024 output tokens', async () => {
    const model = mockModel([modelResult(validResult)])
    openaiMock.model = model

    await new OpenAIIntentParser(context).parse(
      createEmptyTripIntent(),
      'to tokyo',
    )

    expect(model.doGenerateCalls[0]?.maxOutputTokens).toBe(1_024)
  })

  it('shows finite parser string bounds in the generated JSON Schema', async () => {
    const model = mockModel([modelResult(validResult)])
    openaiMock.model = model

    await new OpenAIIntentParser(context).parse(
      createEmptyTripIntent(),
      'to tokyo',
    )

    const responseFormat = JSON.stringify(model.doGenerateCalls[0]?.responseFormat)
    expect(responseFormat).toContain('"city":{"type":"string","minLength":1,"maxLength":200}')
    expect(responseFormat).toContain('"unhandled"')
    expect(responseFormat).toContain('"maxLength":1000')
  })

  it('grounds airport names in the versioned, context-filtered place vocabulary', () => {
    const prompt = buildSystemPrompt(context)
    const narita = prompt.indexOf('NRT: Tokyo (airport names: Narita, Tokyo Narita)')
    const haneda = prompt.indexOf('HND: Tokyo (airport names: Haneda, Tokyo Haneda)')

    expect(narita).toBeGreaterThan(-1)
    expect(haneda).toBeGreaterThan(narita)
    expect(prompt).toContain(
      'NRT: Tokyo (airport names: Narita, Tokyo Narita) [bare city default]',
    )
    expect(prompt).not.toContain(
      'HND: Tokyo (airport names: Haneda, Tokyo Haneda) [bare city default]',
    )
    expect(prompt).not.toContain('HND: Tokyo (airport names: Narita')

    const legacyPlaces = SUPPORTED_PLACES.filter((place) =>
      ['ORD', 'SFO', 'JFK', 'NRT', 'LIS', 'LHR', 'CDG'].includes(place.iata),
    )
    const legacyPrompt = buildSystemPrompt({
      today: context.today,
      supportedPlaces: legacyPlaces,
      airportAliases: airportAliasesForPlaces(legacyPlaces),
    })
    expect(legacyPrompt).toContain('NRT: Tokyo (airport names: Narita, Tokyo Narita)')
    expect(legacyPrompt).not.toContain('Haneda')
    expect(legacyPrompt).not.toContain('Midway')
  })

  it('grounds the closed country vocabulary without country-to-city mappings', () => {
    const prompt = buildSystemPrompt(context)

    expect(prompt).toContain(
      'Japan, United Kingdom, France, Germany, Spain, Italy, Netherlands, ' +
        'Switzerland, Portugal, Ireland, Denmark, Sweden, Austria, Greece, Turkey',
    )
    expect(prompt).toContain('emit only {"country":"<their country>"}')
    expect(prompt).not.toContain('Japan: Tokyo')
    expect(prompt).not.toContain('Germany: Berlin')
  })

  it('accepts a closed-list country destination for engine resolution', async () => {
    const countryResult: ParseResult = {
      intent: {
        ...createEmptyTripIntent(),
        destination: { country: 'Japan' },
      },
      unhandled: null,
    }
    const model = mockModel([modelResult(countryResult)])
    openaiMock.model = model

    await expect(
      new OpenAIIntentParser(context).parse(
        createEmptyTripIntent(),
        "I'm going to Japan",
      ),
    ).resolves.toEqual(countryResult)
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('keeps airport aliases unique and limited to supported registry keys', () => {
    const supportedCodes = new Set<string>(
      SUPPORTED_PLACES.map((place) => place.iata),
    )
    const aliases = Object.entries(PLACE_AIRPORT_ALIASES).flatMap(
      ([iata, names]) => names.map((name) => [iata, name.toLocaleLowerCase()] as const),
    )

    expect(
      Object.keys(PLACE_AIRPORT_ALIASES).every((iata) => supportedCodes.has(iata)),
    ).toBe(true)
    expect(new Set(aliases.map(([, name]) => name)).size).toBe(aliases.length)
    expect(
      Object.keys(
        airportAliasesForPlaces([{ iata: 'HND', city: 'Tokyo' }]),
      ),
    ).toEqual(['HND'])
  })

  it('keeps strict challenge utterances out of prompt examples', () => {
    const prompt = buildSystemPrompt(context).toLocaleLowerCase()
    for (const fixture of parserEvaluationCases.filter(
      (candidate) => candidate.challenge,
    )) {
      expect(prompt).not.toContain(fixture.utterance.toLocaleLowerCase())
    }
  })

  it('retries once with feedback when a schema refinement fails', async () => {
    const invalidDates = {
      ...validResult,
      intent: {
        ...validResult.intent,
        dates: {
          earliest: '2026-02-30',
          latest: '2026-02-30',
          flexibility: 'exact',
        },
      },
    }
    const model = mockModel([modelResult(invalidDates), modelResult(validResult)])
    openaiMock.model = model

    const parser = new OpenAIIntentParser(context)
    await expect(
      parser.parse(createEmptyTripIntent(), 'to tokyo february 30'),
    ).resolves.toEqual(validResult)
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(model.doGenerateCalls.map((call) => call.maxOutputTokens)).toEqual([
      1_024,
      1_024,
    ])
    expect(parser.lastAttemptCount).toBe(2)
  })

  it('bounds oversized malformed output before one successful feedback attempt', async () => {
    const sentinel = 'BEYOND_CAP_SENTINEL'
    const malformed = `{"intent":${'x'.repeat(5_000)}${sentinel}`
    const model = mockModel([
      rawTextResult(malformed),
      modelResult(validResult),
    ])
    openaiMock.model = model

    await expect(
      new OpenAIIntentParser(context).parse(
        createEmptyTripIntent(),
        'to tokyo',
      ),
    ).resolves.toEqual(validResult)

    expect(model.doGenerateCalls).toHaveLength(2)
    const assistantOutput = promptText(model.doGenerateCalls[1], 'assistant')
    const feedbackPrompt = promptText(model.doGenerateCalls[1], 'user', true)
    const validationFragment = feedbackPrompt.split('Validation issues:\n')[1]
    for (const fragment of [assistantOutput, validationFragment]) {
      expect(fragment.length).toBeLessThanOrEqual(
        PARSER_FEEDBACK_FRAGMENT_MAX_UNITS,
      )
      expect(fragment.endsWith('[truncated]')).toBe(true)
      expect(fragment).not.toContain(sentinel)
    }
  })

  it('ends two oversized failures without leaking beyond-cap text', async () => {
    const sentinel = 'BEYOND_CAP_SENTINEL'
    const malformed = `{"intent":${'x'.repeat(5_000)}${sentinel}`
    const model = mockModel([
      rawTextResult(malformed),
      rawTextResult(malformed),
    ])
    openaiMock.model = model

    const parse = new OpenAIIntentParser(context).parse(
      createEmptyTripIntent(),
      'to tokyo',
    )

    await expect(parse).rejects.toMatchObject({
      name: 'ParserError',
      reason: 'invalid_output',
    })
    await expect(parse).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error.message.length <= PARSER_FEEDBACK_FRAGMENT_MAX_UNITS &&
        !error.message.includes(sentinel),
    )
    expect(model.doGenerateCalls).toHaveLength(2)
  })

  it('ends conservatively when truncation hides a fenced JSON candidate', async () => {
    const model = mockModel([
      rawTextResult(
        `\`\`\`${'x'.repeat(PARSER_FEEDBACK_FRAGMENT_MAX_UNITS)}{`,
      ),
    ])
    openaiMock.model = model

    await expect(
      new OpenAIIntentParser(context).parse(
        createEmptyTripIntent(),
        'to tokyo',
      ),
    ).rejects.toMatchObject({
      name: 'ParserError',
      reason: 'invalid_output',
    })
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('retries once when a place is outside the supported registry', async () => {
    const unknownPlace = {
      ...validResult,
      intent: {
        ...validResult.intent,
        destination: { iata: 'XXX', city: 'Unknown', assumed: false },
      },
    }
    const model = mockModel([modelResult(unknownPlace), modelResult(validResult)])
    openaiMock.model = model

    const parser = new OpenAIIntentParser(context)
    await expect(
      parser.parse(createEmptyTripIntent(), 'to tokyo'),
    ).resolves.toEqual(validResult)
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(parser.lastAttemptCount).toBe(2)
  })

  it('bounds oversized registry-membership feedback', async () => {
    const unknownPlace = {
      ...validResult,
      intent: {
        ...validResult.intent,
        destination: { iata: 'XXX', city: 'Unknown', assumed: false },
      },
    }
    const oversizedContext = {
      ...context,
      supportedPlaces: [
        { iata: 'NRT', city: 'Tokyo' },
        ...Array.from({ length: 1_500 }, () => ({
          iata: 'AAA',
          city: 'A',
        })),
      ],
    }
    const model = mockModel([
      modelResult(unknownPlace),
      modelResult(validResult),
    ])
    openaiMock.model = model

    await expect(
      new OpenAIIntentParser(oversizedContext).parse(
        createEmptyTripIntent(),
        'to tokyo',
      ),
    ).resolves.toEqual(validResult)

    const feedbackPrompt = promptText(model.doGenerateCalls[1], 'user', true)
    const validationFragment = feedbackPrompt.split('Validation issues:\n')[1]
    expect(validationFragment.length).toBeLessThanOrEqual(
      PARSER_FEEDBACK_FRAGMENT_MAX_UNITS,
    )
    expect(validationFragment.endsWith('[truncated]')).toBe(true)
  })

  it('retries once when a country is outside the closed registry', async () => {
    const unknownCountry = {
      ...validResult,
      intent: {
        ...validResult.intent,
        destination: { country: 'Brazil' },
      },
    }
    const model = mockModel([
      modelResult(unknownCountry),
      modelResult(validResult),
    ])
    openaiMock.model = model

    const parser = new OpenAIIntentParser(context)
    await expect(
      parser.parse(createEmptyTripIntent(), 'to tokyo'),
    ).resolves.toEqual(validResult)
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(parser.lastAttemptCount).toBe(2)
  })

  it('throws invalid_output after the feedback retry is exhausted', async () => {
    const unknownPlace = {
      ...validResult,
      intent: {
        ...validResult.intent,
        destination: { iata: 'XXX', city: 'Unknown', assumed: false },
      },
    }
    const model = mockModel([modelResult(unknownPlace), modelResult(unknownPlace)])
    openaiMock.model = model

    const parse = new OpenAIIntentParser(context).parse(
      createEmptyTripIntent(),
      'to berlin',
    )
    await expect(parse).rejects.toBeInstanceOf(ParserError)
    await expect(parse).rejects.toMatchObject({
      name: 'ParserError',
      reason: 'invalid_output',
    })
    expect(model.doGenerateCalls).toHaveLength(2)
  })

  it('normalizes whitespace-only unhandled output to null', async () => {
    const model = mockModel([
      modelResult({
        ...validResult,
        unhandled: '   \n ',
      }),
    ])
    openaiMock.model = model

    await expect(
      new OpenAIIntentParser(context).parse(createEmptyTripIntent(), 'to tokyo'),
    ).resolves.toEqual(validResult)
  })

  it('throws transport when the request fails after SDK retries', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error('network unavailable')
      },
    })
    openaiMock.model = model

    const parse = new OpenAIIntentParser(context).parse(
      createEmptyTripIntent(),
      'to tokyo',
    )
    await expect(parse).rejects.toBeInstanceOf(ParserError)
    await expect(parse).rejects.toMatchObject({
      name: 'ParserError',
      reason: 'transport',
    })
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('identifies an exhausted provider quota as the demo budget boundary', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new APICallError({
          message: 'You exceeded your current quota',
          url: 'https://api.openai.com/v1/responses',
          requestBodyValues: {},
          statusCode: 429,
          data: {
            error: {
              code: 'insufficient_quota',
              type: 'insufficient_quota',
            },
          },
        })
      },
    })
    openaiMock.model = model

    const parse = new OpenAIIntentParser(context).parse(
      createEmptyTripIntent(),
      'to tokyo',
    )

    await expect(parse).rejects.toMatchObject({
      name: 'ParserError',
      reason: 'budget_exhausted',
    })
  })

  it.each([
    ['a refusal', rawTextResult("I'm sorry, but I can't help with that")],
    [
      'a differently worded refusal',
      rawTextResult('This request cannot be fulfilled'),
    ],
    ['a token cutoff', rawTextResult('{"intent":', 'length')],
  ])('does not feedback-retry %s', async (_case, response) => {
    const model = mockModel([response])
    openaiMock.model = model

    const parse = new OpenAIIntentParser(context).parse(
      createEmptyTripIntent(),
      'to tokyo',
    )
    await expect(parse).rejects.toMatchObject({
      name: 'ParserError',
      reason: 'invalid_output',
    })
    expect(model.doGenerateCalls).toHaveLength(1)
  })
})

type MockGenerateResult = Awaited<ReturnType<MockLanguageModelV3['doGenerate']>>

function mockModel(results: MockGenerateResult[]): MockLanguageModelV3 {
  let index = 0
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const result = results[index]
      index += 1
      if (!result) throw new Error('unexpected model call')
      return result
    },
  })
}

function modelResult(output: unknown): MockGenerateResult {
  return rawTextResult(JSON.stringify(output))
}

function rawTextResult(
  text: string,
  finishReason: 'stop' | 'length' = 'stop',
): MockGenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: finishReason, raw: finishReason },
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: {
        total: 1,
        text: 1,
        reasoning: 0,
      },
    },
    warnings: [],
  }
}

function promptText(
  call: MockLanguageModelV3['doGenerateCalls'][number],
  role: 'assistant' | 'user',
  last = false,
): string {
  const messages = call.prompt.filter((message) => message.role === role)
  const message = last ? messages.at(-1) : messages[0]
  if (!message || typeof message.content === 'string') {
    throw new Error(`missing ${role} prompt message`)
  }
  const text = message.content.find((part) => part.type === 'text')
  if (!text || text.type !== 'text') {
    throw new Error(`missing ${role} prompt text`)
  }
  return text.text
}
