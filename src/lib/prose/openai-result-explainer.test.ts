import { APICallError } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExplanationFacts } from '../engine/types'
import {
  classifyExplainerFailure,
  OpenAIResultExplainer,
} from './openai-result-explainer'
import { fallbackLine } from './render'

const openaiMock = vi.hoisted(() => ({
  model: undefined as MockLanguageModelV3 | undefined,
}))

vi.mock('@ai-sdk/openai', () => ({
  openai: () => {
    if (!openaiMock.model) throw new Error('mock model was not configured')
    return openaiMock.model
  },
}))

const facts: ExplanationFacts = {
  optionId: 'option-1',
  stops: 0,
  totalDurationMinutes: 815,
  price: { totalUsd: 1450 },
  isBestMatch: true,
  isCheapest: false,
  isFastest: false,
  arriveBy: null,
  nonstopRequired: false,
  vsCheapest: null,
  vsFastest: null,
}

describe('OpenAIResultExplainer', () => {
  beforeEach(() => {
    openaiMock.model = undefined
  })

  it('returns clean model copy', async () => {
    openaiMock.model = mockModel('Nonstop and 13h 35m, for $1,450 total.')

    await expect(new OpenAIResultExplainer().explain(facts)).resolves.toEqual({
      text: 'Nonstop and 13h 35m, for $1,450 total.',
      source: 'model',
    })
  })

  it('falls back for a pre-aborted caller without calling the provider', async () => {
    const model = mockModel('Nonstop and 13h 35m, for $1,450 total.')
    openaiMock.model = model
    const caller = new AbortController()
    const timeout = new AbortController()
    const timeoutSignal = vi.fn(() => timeout.signal)
    caller.abort()

    await expect(
      new OpenAIResultExplainer({ timeoutSignal }).explain(
        facts,
        caller.signal,
      ),
    ).resolves.toEqual({
      text: fallbackLine(facts),
      source: 'fallback',
    })
    expect(timeoutSignal).toHaveBeenCalledWith(8_000)
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('carries an active caller abort to the provider and falls back', async () => {
    let providerSignal: AbortSignal | undefined
    const model = new MockLanguageModelV3({
      doGenerate: async ({ abortSignal }) => {
        providerSignal = abortSignal
        await waitForAbort(abortSignal)
        throw new Error('provider aborted')
      },
    })
    openaiMock.model = model
    const caller = new AbortController()

    const explanation = new OpenAIResultExplainer().explain(
      facts,
      caller.signal,
    )
    await vi.waitFor(() => expect(providerSignal).toBeDefined())
    caller.abort()

    await expect(explanation).resolves.toEqual({
      text: fallbackLine(facts),
      source: 'fallback',
    })
    expect(providerSignal).not.toBe(caller.signal)
    expect(providerSignal?.aborted).toBe(true)
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('uses the injected total deadline and falls back', async () => {
    let providerSignal: AbortSignal | undefined
    const timeout = new AbortController()
    const timeoutSignal = vi.fn(() => timeout.signal)
    const model = new MockLanguageModelV3({
      doGenerate: async ({ abortSignal }) => {
        providerSignal = abortSignal
        await waitForAbort(abortSignal)
        throw new Error('provider timed out')
      },
    })
    openaiMock.model = model

    const explanation = new OpenAIResultExplainer({
      timeoutMs: 654,
      timeoutSignal,
    }).explain(facts)
    await vi.waitFor(() => expect(providerSignal).toBeDefined())
    timeout.abort()

    await expect(explanation).resolves.toEqual({
      text: fallbackLine(facts),
      source: 'fallback',
    })
    expect(timeoutSignal).toHaveBeenCalledOnce()
    expect(timeoutSignal).toHaveBeenCalledWith(654)
    expect(providerSignal).toBe(timeout.signal)
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'rejects invalid timeout %s at construction',
    (timeoutMs) => {
      expect(() => new OpenAIResultExplainer({ timeoutMs })).toThrow(RangeError)
    },
  )

  it.each([
    ['an uncomputed number', mockModel('About 40% cheaper.')],
    ['an em dash', mockModel('Best match — nonstop and 13h 35m.')],
    ['empty output', mockModel('   ')],
    ['oversized output', mockModel('x'.repeat(301))],
    [
      'a model error',
      new MockLanguageModelV3({
        doGenerate: async () => {
          throw new Error('network unavailable')
        },
      }),
    ],
  ])('falls back for %s', async (_case, model) => {
    openaiMock.model = model

    await expect(new OpenAIResultExplainer().explain(facts)).resolves.toEqual({
      text: fallbackLine(facts),
      source: 'fallback',
    })
  })

  it('surfaces an exhausted provider quota instead of hiding it as prose fallback', async () => {
    openaiMock.model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new APICallError({
          message: 'You exceeded your current quota',
          url: 'https://api.openai.com/v1/responses',
          requestBodyValues: {},
          statusCode: 429,
          responseHeaders: {},
          responseBody: JSON.stringify({
            error: { code: 'insufficient_quota' },
          }),
          isRetryable: false,
        })
      },
    })

    await expect(new OpenAIResultExplainer().explain(facts)).resolves.toEqual({
      source: 'budget_exhausted',
    })
  })

  it('classifies recognized quota before an already-aborted model signal', () => {
    const signal = AbortSignal.abort()
    const error = new APICallError({
      message: 'You exceeded your current quota',
      url: 'https://api.openai.com/v1/responses',
      requestBodyValues: {},
      statusCode: 429,
      data: { error: { code: 'insufficient_quota' } },
    })

    expect(classifyExplainerFailure(error, signal)).toBe('budget_exhausted')
  })
})

function mockModel(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: 'stop' },
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
    }),
  })
}

function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (!signal) throw new Error('missing provider abort signal')
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}
