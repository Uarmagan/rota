import { MockLanguageModelV3 } from 'ai/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExplanationFacts } from '../engine/types'
import { OpenAIResultExplainer } from './openai-result-explainer'
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
  price: {
    totalMiles: 145000,
    totalFeesUsd: 96,
    program: 'Meridian Elite',
  },
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
    openaiMock.model = mockModel('Nonstop and 13h 35m, with a 145,000-mile price.')

    await expect(new OpenAIResultExplainer().explain(facts)).resolves.toEqual({
      text: 'Nonstop and 13h 35m, with a 145,000-mile price.',
      source: 'model',
    })
  })

  it.each([
    ['an uncomputed number', mockModel('About 40% cheaper.')],
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
