import type { ExplanationFacts } from '../engine/types'

export interface Explanation {
  text: string
  source: 'model' | 'fallback'
}

export interface ResultExplainer {
  explain(facts: ExplanationFacts): Promise<Explanation>
}
