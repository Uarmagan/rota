import type { ExplanationFacts } from '../engine/types'

export interface Explanation {
  text: string
  source: 'model' | 'fallback'
}

export type ExplanationOutcome =
  | Explanation
  | { source: 'budget_exhausted' }

export interface ResultExplainer {
  explain(facts: ExplanationFacts): Promise<ExplanationOutcome>
}
