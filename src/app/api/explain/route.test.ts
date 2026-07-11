import { describe, expect, it, vi } from 'vitest'
import type { ExplanationFacts } from '../../../lib/engine/types'
import type { ResultExplainer } from '../../../lib/prose/result-explainer'
import { handleExplain } from './route'

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

describe('handleExplain', () => {
  it('returns guarded explainer copy', async () => {
    const explainer: ResultExplainer = {
      explain: async () => ({ text: 'Best match.', source: 'model' }),
    }

    const response = await handleExplain(explainRequest({ facts }), explainer)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      text: 'Best match.',
      source: 'model',
    })
  })

  it('rejects schema-invalid facts without calling the explainer', async () => {
    const explain = vi.fn<ResultExplainer['explain']>()
    const { vsCheapest: _omitted, ...invalidFacts } = facts

    const response = await handleExplain(
      explainRequest({ facts: invalidFacts }),
      { explain },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_request' })
    expect(explain).not.toHaveBeenCalled()
  })
})

function explainRequest(body: unknown): Request {
  return new Request('http://localhost/api/explain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
