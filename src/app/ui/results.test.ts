// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { FlightOption } from '@/lib/engine/types'
import { Results } from './results'

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
      flight: 'UA 101',
    },
    {
      from: 'JFK',
      to: 'NRT',
      departLocal: '2027-02-03T11:00',
      arriveLocal: '2027-02-04T15:00',
      flight: 'NH 202',
    },
  ],
  totalDurationMinutes: 1_140,
  pricing: { priceUsd: 800 },
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
      flight: 'NH 303',
    },
  ],
  totalDurationMinutes: 960,
  pricing: { priceUsd: 700 },
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
    expect(details.textContent).toContain('UA 101')
    expect(details.textContent).toContain('ORD 08:00 → JFK 10:00')
    expect(details.textContent).toContain('1h layover in JFK')
    expect(details.textContent).toContain('NH 202')
    expect(details.textContent).toContain('business')
    expect(details.textContent).toContain('$800 per traveler · $1,600 total for 2')

    firstButton.focus()
    await user.keyboard('{Enter}')
    expect(firstButton.getAttribute('aria-expanded')).toBe('false')
    await user.keyboard(' ')
    expect(firstButton.getAttribute('aria-expanded')).toBe('true')
  })

  it('shows airline identity and price on the collapsed row', () => {
    renderResults([first, second])
    const firstButton = screen.getByRole('button', { name: /08:00.*15:00/i })
    expect(firstButton.textContent).toContain('United · ANA')
    expect(firstButton.textContent).toContain('$1,600')
    expect(firstButton.textContent).toContain('1 stop · JFK')
    const secondButton = screen.getByRole('button', { name: /09:00.*14:00/i })
    expect(secondButton.textContent).toContain('ANA')
    expect(secondButton.textContent).toContain('nonstop')
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

    rerender(resultsElement([first, second], second.id, {
      optionId: second.id,
      text: 'Best second option.',
    }))
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

    rerender(resultsElement([second], second.id, null))
    rerender(resultsElement([first, second], second.id, null))
    expect(
      screen.getByRole('button', { name: /08:00.*15:00/i }).getAttribute(
        'aria-expanded',
      ),
    ).toBe('false')
  })

  it('reports stream progress and filtered-out counts in the header', () => {
    render(
      createElement(Results, {
        options: [second],
        travelers: 2,
        bestId: second.id,
        why: null,
        streaming: true,
        sourcesDone: 2,
        sourcesTotal: 4,
        hidden: 3,
      }),
    )
    expect(screen.getByText('2/4 sources')).toBeTruthy()
    expect(screen.getByText(/3 hidden by your filters/)).toBeTruthy()
  })
})

function renderResults(
  options: readonly FlightOption[],
  bestId: string | null = first.id,
  why: { optionId: string; text: string } | null = null,
) {
  return render(resultsElement(options, bestId, why))
}

function resultsElement(
  options: readonly FlightOption[],
  bestId: string | null,
  why: { optionId: string; text: string } | null,
) {
  return createElement(Results, {
    options,
    travelers: 2,
    bestId,
    why,
    streaming: false,
    sourcesDone: 4,
    sourcesTotal: 4,
    hidden: 0,
  })
}
