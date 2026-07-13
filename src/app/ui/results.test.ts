// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { FlightOption } from '@/lib/engine/types'
import { Results, type SourceView } from './results'

const first: FlightOption = {
  id: 'meridian-001',
  source: 'meridian',
  cabin: 'business',
  segments: [
    {
      from: 'ORD',
      to: 'JFK',
      departLocal: '2027-02-03T08:00',
      arriveLocal: '2027-02-03T10:00',
    },
    {
      from: 'JFK',
      to: 'NRT',
      departLocal: '2027-02-03T11:00',
      arriveLocal: '2027-02-04T15:00',
    },
  ],
  totalDurationMinutes: 1_140,
  pricing: { baseMiles: 80_000, feesUsd: 60, program: 'Meridian Rewards' },
}

const second: FlightOption = {
  id: 'meridian-002',
  source: 'meridian',
  cabin: 'business',
  segments: [
    {
      from: 'ORD',
      to: 'NRT',
      departLocal: '2027-02-03T09:00',
      arriveLocal: '2027-02-04T14:00',
    },
  ],
  totalDurationMinutes: 960,
  pricing: { baseMiles: 70_000, feesUsd: 50, program: 'Meridian Rewards' },
}

afterEach(cleanup)

describe('Results', () => {
  it('toggles deterministic details with mouse and keyboard', async () => {
    const user = userEvent.setup()
    renderResults([first, second])
    const firstButton = screen.getByRole('button', { name: /08:00.*15:00/i })

    await user.click(firstButton)
    expect(firstButton.getAttribute('aria-expanded')).toBe('true')
    const details = screen.getByRole('region', { name: 'Details for meridian-001' })
    expect(details.textContent).toContain('ORD → JFK')
    expect(details.textContent).toContain('2027-02-03 08:00 → 2027-02-03 10:00')
    expect(details.textContent).toContain('JFK → NRT')
    expect(details.textContent).toContain('business · Meridian Rewards')
    expect(details.textContent).toContain('160,000 miles + $120 for 2 travelers')

    firstButton.focus()
    await user.keyboard('{Enter}')
    expect(firstButton.getAttribute('aria-expanded')).toBe('false')
    await user.keyboard(' ')
    expect(firstButton.getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps at most one result open', async () => {
    const user = userEvent.setup()
    renderResults([first, second])
    const firstButton = screen.getByRole('button', { name: /08:00.*15:00/i })
    const secondButton = screen.getByRole('button', { name: /09:00.*14:00/i })

    await user.click(firstButton)
    await user.click(secondButton)
    expect(firstButton.getAttribute('aria-expanded')).toBe('false')
    expect(secondButton.getAttribute('aria-expanded')).toBe('true')
  })

  it('moves the best badge and binds why copy only to the matching current best', async () => {
    const user = userEvent.setup()
    const { rerender } = renderResults([first, second], first.id, {
      optionId: first.id,
      text: 'Best first option.',
    })
    const firstButton = screen.getByRole('button', { name: /08:00.*15:00/i })
    await user.click(firstButton)
    expect(screen.getByText('Best first option.')).toBeTruthy()

    rerender(
      createElement(Results, {
        sources: sources([first, second]),
        travelers: 2,
        bestId: second.id,
        why: { optionId: second.id, text: 'Best second option.' },
      }),
    )
    expect(screen.getAllByText('★ BEST')).toHaveLength(1)
    expect(firstButton.textContent).not.toContain('★ BEST')
    expect(screen.queryByText('Best first option.')).toBeNull()
    expect(screen.queryByText('Best second option.')).toBeNull()

    await user.click(screen.getByRole('button', { name: /09:00.*14:00/i }))
    expect(screen.getByText('Best second option.')).toBeTruthy()
  })

  it('closes an expanded row when that option leaves the result set', async () => {
    const user = userEvent.setup()
    const { rerender } = renderResults([first, second])
    await user.click(screen.getByRole('button', { name: /08:00.*15:00/i }))

    rerender(
      createElement(Results, {
        sources: sources([second]),
        travelers: 2,
        bestId: second.id,
        why: null,
      }),
    )
    rerender(
      createElement(Results, {
        sources: sources([first, second]),
        travelers: 2,
        bestId: second.id,
        why: null,
      }),
    )
    expect(
      screen.getByRole('button', { name: /08:00.*15:00/i }).getAttribute(
        'aria-expanded',
      ),
    ).toBe('false')
  })
})

function renderResults(
  options: readonly FlightOption[],
  bestId: string | null = first.id,
  why: { optionId: string; text: string } | null = null,
) {
  return render(
    createElement(Results, {
      sources: sources(options),
      travelers: 2,
      bestId,
      why,
    }),
  )
}

function sources(options: readonly FlightOption[]): SourceView[] {
  return [
    {
      id: 'meridian',
      program: 'Meridian Rewards',
      options,
      hidden: 0,
      status: 'done',
    },
  ]
}
