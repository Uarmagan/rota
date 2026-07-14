import { MockLanguageModelV3 } from 'ai/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SUPPORTED_PLACES } from '../schema/places'
import {
  createEmptyTripIntent,
  type ParseResult,
} from '../schema/trip-intent'
import { ParserError } from './intent-parser'
import { OpenAIIntentParser } from './openai-intent-parser'

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
}

const validResult: ParseResult = {
  intent: {
    ...createEmptyTripIntent(),
    destination: { iata: 'NRT', city: 'Tokyo' },
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
    expect(parser.lastAttemptCount).toBe(2)
  })

  it('retries once when a place is outside the supported registry', async () => {
    const unknownPlace = {
      ...validResult,
      intent: {
        ...validResult.intent,
        destination: { iata: 'XXX', city: 'Unknown' },
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

  it('throws invalid_output after the feedback retry is exhausted', async () => {
    const unknownPlace = {
      ...validResult,
      intent: {
        ...validResult.intent,
        destination: { iata: 'XXX', city: 'Unknown' },
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
