// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fragment, StrictMode, Suspense, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const third: FlightOption = {
  ...second,
  id: 'meridian-003',
  segments: second.segments.map((segment) => ({
    ...segment,
    flight: 'NH 404',
  })),
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'matchMedia')
  Reflect.deleteProperty(Element.prototype, 'animate')
})

describe('Results', () => {
  it('does not let an abandoned render consume first-wave entrance delays', () => {
    installMotionPreference(false)
    const { rerender } = render(
      createElement(
        Suspense,
        { fallback: null },
        createElement(ResultsThenMaybeSuspend, {
          options: [],
          shouldSuspend: false,
        }),
      ),
    )

    rerender(
      createElement(
        Suspense,
        { fallback: null },
        createElement(ResultsThenMaybeSuspend, {
          options: [first, second],
          shouldSuspend: true,
        }),
      ),
    )
    rerender(
      createElement(
        Suspense,
        { fallback: null },
        createElement(ResultsThenMaybeSuspend, {
          options: [first, third],
          shouldSuspend: false,
        }),
      ),
    )

    const rows = document.querySelectorAll<HTMLElement>('.rota-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].style.animationDelay).toBe('0ms')
    expect(rows[1].style.animationDelay).toBe('30ms')
  })

  it('keeps wave, crown, and verdict metadata stable across repeated renders', () => {
    installMotionPreference(false)
    const { rerender } = render(
      resultsElement([first], first.id, null, true),
    )
    expect(resultRow(first).style.animationDelay).toBe('0ms')

    const streamingHandoff = resultsElement(
      [first, second],
      second.id,
      null,
      true,
    )
    rerender(streamingHandoff)
    expect(resultRow(second).style.animationDelay).toBe('0ms')
    expect(screen.getByText('★ BEST').style.animationDelay).toBe('280ms')
    expect(resultRow(second).classList.contains('rota-verdict')).toBe(false)

    rerender(streamingHandoff)
    expect(screen.getByText('★ BEST').style.animationDelay).toBe('280ms')
    expect(resultRow(second).classList.contains('rota-verdict')).toBe(false)

    const settled = resultsElement([first, second], second.id, null, false)
    rerender(settled)
    expect(resultRow(second).classList.contains('rota-verdict')).toBe(true)
    rerender(settled)
    expect(resultRow(second).classList.contains('rota-verdict')).toBe(true)
  })

  it('keeps initial-wave motion metadata stable in StrictMode', () => {
    installMotionPreference(false)
    render(
      createElement(
        StrictMode,
        null,
        resultsElement([first, second], first.id, null, true),
      ),
    )

    expect(resultRow(first).style.animationDelay).toBe('0ms')
    expect(resultRow(second).style.animationDelay).toBe('30ms')
  })

  it('removes delays and browser animation work for reduced motion', () => {
    installMotionPreference(true)
    const animate = installAnimateStub()
    const { rerender } = render(
      resultsElement([first, second], first.id, null, true),
    )

    expect(resultRow(first).style.animationDelay).toBe('0ms')
    expect(resultRow(second).style.animationDelay).toBe('0ms')
    rerender(resultsElement([second, first], second.id, null, true))
    expect(screen.getByText('★ BEST').style.animationDelay).toBe('0ms')
    expect(animate).not.toHaveBeenCalled()
  })

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

const never = new Promise<void>(() => undefined)

function Suspend(): never {
  throw never
}

function ResultsThenMaybeSuspend({
  options,
  shouldSuspend,
}: {
  options: readonly FlightOption[]
  shouldSuspend: boolean
}) {
  return createElement(
    Fragment,
    null,
    resultsElement(options, options[0]?.id ?? null, null, true),
    shouldSuspend ? createElement(Suspend) : null,
  )
}

function installMotionPreference(reduced: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: reduced }),
  })
}

function installAnimateStub() {
  const animate = vi.fn(
    () => ({ cancel: vi.fn() }) as unknown as Animation,
  )
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: animate,
  })
  return animate
}

function resultRow(option: FlightOption): HTMLElement {
  const time = option.segments[0].departLocal.slice(11, 16)
  const button = screen.getByRole('button', { name: new RegExp(time) })
  const row = button.closest<HTMLElement>('.rota-row')
  if (!row) throw new Error(`Missing result row for ${option.id}`)
  return row
}

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
  streaming = false,
) {
  return createElement(Results, {
    options,
    travelers: 2,
    bestId,
    why,
    streaming,
    sourcesDone: 4,
    sourcesTotal: 4,
    hidden: 0,
  })
}
