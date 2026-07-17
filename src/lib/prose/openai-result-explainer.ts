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
  timeoutMs?: number
  timeoutSignal?: (ms: number) => AbortSignal
}

const DEFAULT_EXPLAINER_TIMEOUT_MS = 8_000
const MAX_TIMEOUT_MS = 2_147_483_647

export class OpenAIResultExplainer implements ResultExplainer {
  readonly modelId: string
  private readonly timeoutMs: number
  private readonly timeoutSignal: (ms: number) => AbortSignal

  constructor(options: ExplainerOptions = {}) {
    this.modelId = options.model ?? process.env.ROTA_MODEL ?? 'gpt-5.6-luna'
    this.timeoutMs = validateTimeout(
      options.timeoutMs ?? DEFAULT_EXPLAINER_TIMEOUT_MS,
    )
    this.timeoutSignal = options.timeoutSignal ?? AbortSignal.timeout
  }

  async explain(
    facts: ExplanationFacts,
    signal?: AbortSignal,
  ): Promise<ExplanationOutcome> {
    const deadlineSignal = this.timeoutSignal(this.timeoutMs)
    const modelSignal = signal === undefined
      ? deadlineSignal
      : AbortSignal.any([signal, deadlineSignal])
    if (modelSignal.aborted) return fallback(facts)

    try {
      const { text } = await generateText({
        model: openai(this.modelId),
        system: buildSystemPrompt(),
        prompt: buildUserMessage(facts),
        maxRetries: 1,
        maxOutputTokens: 300,
        abortSignal: modelSignal,
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
      const classification = classifyExplainerFailure(error, modelSignal)
      if (classification === 'budget_exhausted') {
        return { source: 'budget_exhausted' }
      }
      return fallback(facts)
    }
  }
}

function validateTimeout(timeoutMs: number): number {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new RangeError(
      `timeoutMs must be a positive safe integer no greater than ${MAX_TIMEOUT_MS}`,
    )
  }
  return timeoutMs
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

export function classifyExplainerFailure(
  error: unknown,
  modelSignal: AbortSignal,
): 'budget_exhausted' | 'cancelled' | 'other' {
  if (isBudgetExhausted(error)) return 'budget_exhausted'
  if (modelSignal.aborted) return 'cancelled'
  return 'other'
}

function serialized(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}
