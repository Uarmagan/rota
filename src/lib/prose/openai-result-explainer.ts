import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { ExplanationFacts } from '../engine/types'
import { checkNumberProvenance } from './number-guard'
import { buildSystemPrompt, buildUserMessage } from './prompt'
import { fallbackLine } from './render'
import type { Explanation, ResultExplainer } from './result-explainer'

interface ExplainerOptions {
  model?: string
}

export class OpenAIResultExplainer implements ResultExplainer {
  readonly modelId: string

  constructor(options: ExplainerOptions = {}) {
    this.modelId = options.model ?? process.env.ROTA_MODEL ?? 'gpt-5.6-luna'
  }

  async explain(facts: ExplanationFacts): Promise<Explanation> {
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
        !checkNumberProvenance(candidate, facts).ok
      ) {
        return fallback(facts)
      }
      return { text: candidate, source: 'model' }
    } catch {
      return fallback(facts)
    }
  }
}

function fallback(facts: ExplanationFacts): Explanation {
  return { text: fallbackLine(facts), source: 'fallback' }
}
