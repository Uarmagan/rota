import { describe, expect, it, vi } from 'vitest'
import type { ExplanationFacts } from '../../../lib/engine/types'
import type { ResultExplainer } from '../../../lib/prose/result-explainer'
import type { ModelCallGate } from '../../../lib/server/request-gate'
import { handleExplain } from './route'

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

describe('handleExplain', () => {
  it('returns guarded explainer copy', async () => {
    const explainer: ResultExplainer = {
      explain: async () => ({ text: 'Best match.', source: 'model' }),
    }

    const response = await handleExplain(
      explainRequest({ facts }),
      explainer,
      allowingGate,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      text: 'Best match.',
      source: 'model',
    })
  })

  it('preserves fallback explainer success', async () => {
    const explainer: ResultExplainer = {
      explain: async () => ({ text: 'Best match.', source: 'fallback' }),
    }

    const response = await handleExplain(
      explainRequest({ facts }),
      explainer,
      allowingGate,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      text: 'Best match.',
      source: 'fallback',
    })
  })

  it('returns the public budget boundary when explainer credits are exhausted', async () => {
    const explainer: ResultExplainer = {
      explain: async () => ({ source: 'budget_exhausted' }),
    }

    const response = await handleExplain(
      explainRequest({ facts }),
      explainer,
      allowingGate,
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'demo_budget_exhausted',
    })
  })

  it('rejects schema-invalid facts without calling the explainer', async () => {
    const explain = vi.fn<ResultExplainer['explain']>()
    const { vsCheapest: _omitted, ...invalidFacts } = facts

    const response = await handleExplain(
      explainRequest({ facts: invalidFacts }),
      { explain },
      allowingGate,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_request' })
    expect(explain).not.toHaveBeenCalled()
  })

  it('rejects an oversized body before calling the explainer', async () => {
    const explain = vi.fn<ResultExplainer['explain']>()
    const response = await handleExplain(
      new Request('http://localhost/api/explain', {
        method: 'POST',
        body: JSON.stringify({ value: 'x'.repeat(32 * 1024) }),
      }),
      { explain },
      allowingGate,
    )

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'request_too_large' })
    expect(explain).not.toHaveBeenCalled()
  })

  it('returns 429 without explaining when the model-call gate rejects', async () => {
    const explain = vi.fn<ResultExplainer['explain']>()
    const response = await handleExplain(
      explainRequest({ facts }),
      { explain },
      rejectingGate,
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('3')
    expect(await response.json()).toEqual({ error: 'rate_limited' })
    expect(explain).not.toHaveBeenCalled()
  })

  it('releases the model-call permit when the explainer throws', async () => {
    const release = vi.fn()
    const gate: ModelCallGate = {
      acquire: () => ({ ok: true, permit: { release } }),
    }
    const explainer: ResultExplainer = {
      explain: async () => {
        throw new Error('unexpected failure')
      },
    }

    await expect(
      handleExplain(explainRequest({ facts }), explainer, gate),
    ).rejects.toThrow('unexpected failure')
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects a fractional party price before explaining', async () => {
    const explain = vi.fn<ResultExplainer['explain']>()
    const response = await handleExplain(
      explainRequest({
        facts: {
          ...facts,
          price: { totalUsd: 1450.5 },
        },
      }),
      { explain },
      allowingGate,
    )

    expect(response.status).toBe(400)
    expect(explain).not.toHaveBeenCalled()
  })

  it('accepts an option label at exactly 100 Unicode code points', async () => {
    const explain = vi.fn(async () => ({ text: 'Best match.', source: 'model' as const }))
    const response = await handleExplain(
      explainRequest({
        facts: {
          ...facts,
          optionId: '🚀'.repeat(100),
        },
      }),
      { explain },
      allowingGate,
    )

    expect(response.status).toBe(200)
    expect(explain).toHaveBeenCalledOnce()
  })

  it('rejects an option id over 100 Unicode code points before explaining', async () => {
    const explain = vi.fn<ResultExplainer['explain']>()
    const response = await handleExplain(
      explainRequest({ facts: { ...facts, optionId: '🚀'.repeat(101) } }),
      { explain },
      allowingGate,
    )

    expect(response.status).toBe(400)
    expect(explain).not.toHaveBeenCalled()
  })

  it('rejects an excessive numeric fact before explaining', async () => {
    const explain = vi.fn<ResultExplainer['explain']>()
    const response = await handleExplain(
      explainRequest({ facts: { ...facts, totalDurationMinutes: 10_081 } }),
      { explain },
      allowingGate,
    )

    expect(response.status).toBe(400)
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

const rejectingGate: ModelCallGate = {
  acquire: () => ({ ok: false, retryAfterMs: 2_001 }),
}

const allowingGate: ModelCallGate = {
  acquire: () => ({ ok: true, permit: { release() {} } }),
}
