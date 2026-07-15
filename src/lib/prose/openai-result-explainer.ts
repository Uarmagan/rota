import { openai } from '@ai-sdk/openai'
import { APICallError, generateText, RetryError } from 'ai'
import type { ExplanationFacts } from '../engine/types'
import { checkNumberProvenance } from './number-guard'
import { buildSystemPrompt, buildUserMessage } from './prompt'
import { fallbackLine } from './render'
import type {
  Explanation,
  ExplanationOutcome,
  ResultExplainer,
} from './result-explainer'

interface ExplainerOptions {
  model?: string
}

export class OpenAIResultExplainer implements ResultExplainer {
  readonly modelId: string

  constructor(options: ExplainerOptions = {}) {
    this.modelId = options.model ?? process.env.ROTA_MODEL ?? 'gpt-5.6-luna'
  }

  async explain(facts: ExplanationFacts): Promise<ExplanationOutcome> {
    try {
      const { text } = await generateText({
        model: openai(this.modelId),
        system: buildSystemPrompt(),
        prompt: buildUserMessage(facts),
        maxRetries: 1,
        maxOutputTokens: 300,
        providerOptions: {
          openai: { reasoningEffort: 'none' },
        },
      })
      const candidate = text.trim()
      if (
        candidate.length === 0 ||
        candidate.length > 300 ||
        candidate.includes('—') ||
        !checkNumberProvenance(candidate, facts).ok
      ) {
        return fallback(facts)
      }
      return { text: candidate, source: 'model' }
    } catch (error) {
      if (isBudgetExhausted(error)) return { source: 'budget_exhausted' }
      return fallback(facts)
    }
  }
}

function fallback(facts: ExplanationFacts): Explanation {
  return { text: fallbackLine(facts), source: 'fallback' }
}

const BUDGET_ERROR_PATTERN =
  /insufficient_quota|billing_hard_limit_reached|usage_limit_reached|exceeded your current quota|credit balance/i

function isBudgetExhausted(error: unknown): boolean {
  const candidates = RetryError.isInstance(error) ? error.errors : [error]
  return candidates.some((candidate) => {
    if (!APICallError.isInstance(candidate)) return false
    return [candidate.data, candidate.responseBody, candidate.message].some(
      (value) => BUDGET_ERROR_PATTERN.test(serialized(value)),
    )
  })
}

function serialized(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}
