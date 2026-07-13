// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IntentEdit } from '@/lib/engine/edit'
import type { TripIntent } from '@/lib/schema/trip-intent'
import { ChipsRow } from './chips'

const intent: TripIntent = {
  travelers: 2,
  origin: { iata: 'ORD', city: 'Chicago', assumed: true },
  destination: { iata: 'NRT', city: 'Tokyo' },
  cabin: 'economy',
  dates: {
    earliest: '2027-02-03',
    latest: '2027-02-03',
    flexibility: 'exact',
  },
  priority: 'cheapest',
  constraints: {
    nonstop: 'preferred',
    arriveBy: '17:00',
    departAfter: '09:00',
    avoidRedeye: true,
    avoidLateArrival: false,
  },
}

afterEach(cleanup)

describe('ChipsRow', () => {
  it('edits travelers, origin, destination, and cabin through accessible controls', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /travelers.*2/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Travelers' }), '4')
    expect(onEdit).toHaveBeenLastCalledWith({ field: 'travelers', value: 4 })

    await user.click(screen.getByRole('button', { name: /from.*ORD.*assumed/i }))
    await user.click(screen.getByRole('button', { name: /Chicago ORD.*confirm/i }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'origin',
      value: { iata: 'ORD', city: 'Chicago' },
    })

    await user.click(screen.getByRole('button', { name: /to.*NRT/i }))
    await user.click(screen.getByRole('button', { name: /Lisbon LIS/i }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'destination',
      value: { iata: 'LIS', city: 'Lisbon' },
    })

    await user.click(screen.getByRole('button', { name: /cabin.*economy/i }))
    await user.click(screen.getByRole('button', { name: 'business' }))
    expect(onEdit).toHaveBeenLastCalledWith({ field: 'cabin', value: 'business' })
  })

  it('applies exact and ordered flexible date edits', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /dates.*Feb 3/i }))
    const panel = screen.getByRole('group', { name: 'Edit Dates' })
    const exactDate = within(panel).getByLabelText('Date')
    await user.clear(exactDate)
    await user.type(exactDate, '2027-02-08')
    await user.click(within(panel).getByRole('button', { name: 'Apply' }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'dates',
      value: {
        earliest: '2027-02-08',
        latest: '2027-02-08',
        flexibility: 'exact',
      },
    })

    await user.click(screen.getByRole('button', { name: /dates.*Feb 3/i }))
    await user.click(screen.getByRole('radio', { name: 'Flexible' }))
    const flexiblePanel = screen.getByRole('group', { name: 'Edit Dates' })
    const earliest = within(flexiblePanel).getByLabelText('Earliest')
    const latest = within(flexiblePanel).getByLabelText('Latest')
    await user.clear(earliest)
    await user.type(earliest, '2027-02-10')
    await user.clear(latest)
    await user.type(latest, '2027-02-09')
    expect(
      (within(flexiblePanel).getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    await user.clear(latest)
    await user.type(latest, '2027-02-14')
    await user.click(within(flexiblePanel).getByRole('button', { name: 'Apply' }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'dates',
      value: {
        earliest: '2027-02-10',
        latest: '2027-02-14',
        flexibility: 'flexible',
      },
    })
  })

  it('edits priority and every constraint family', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()
    const cases: readonly [RegExp, string, IntentEdit][] = [
      [/priority.*cheapest/i, 'fastest', { field: 'priority', value: 'fastest' }],
      [/nonstop.*preferred/i, 'required', {
        field: 'constraints.nonstop',
        value: 'required',
      }],
      [/red-eyes.*avoid/i, 'fine', {
        field: 'constraints.avoidRedeye',
        value: false,
      }],
      [/late arrival.*fine/i, 'avoid', {
        field: 'constraints.avoidLateArrival',
        value: true,
      }],
    ]

    for (const [chipName, optionName, expected] of cases) {
      await user.click(screen.getByRole('button', { name: chipName }))
      await user.click(screen.getByRole('button', { name: optionName }))
      expect(onEdit).toHaveBeenLastCalledWith(expected)
    }

    await user.click(screen.getByRole('button', { name: /arrive by.*17:00/i }))
    const arrive = screen.getByLabelText('Arrive by')
    await user.clear(arrive)
    await user.type(arrive, '19:30')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'constraints.arriveBy',
      value: '19:30',
    })

    await user.click(screen.getByRole('button', { name: /depart after.*09:00/i }))
    const depart = screen.getByLabelText('Depart after')
    await user.clear(depart)
    await user.type(depart, '10:15')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'constraints.departAfter',
      value: '10:15',
    })
  })

  it('offers Clear only for semantically removable fields', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()

    for (const chipName of [/travelers/i, /from/i, /cabin/i]) {
      await user.click(screen.getByRole('button', { name: chipName }))
      expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
      await user.keyboard('{Escape}')
    }

    await user.click(screen.getByRole('button', { name: /to.*NRT/i }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onEdit).toHaveBeenLastCalledWith({ field: 'destination', value: null })

    await user.click(screen.getByRole('button', { name: /dates.*Feb 3/i }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onEdit).toHaveBeenLastCalledWith({ field: 'dates', value: null })

    await user.click(screen.getByRole('button', { name: /nonstop/i }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'constraints.nonstop',
      value: null,
    })
  })

  it('keeps one editor open and closes it on Escape or outside click', async () => {
    setup()
    const user = userEvent.setup()
    const travelers = screen.getByRole('button', { name: /travelers/i })
    const cabin = screen.getByRole('button', { name: /cabin/i })

    await user.click(travelers)
    expect(travelers.getAttribute('aria-expanded')).toBe('true')
    await user.click(cabin)
    expect(travelers.getAttribute('aria-expanded')).toBe('false')
    expect(cabin.getAttribute('aria-expanded')).toBe('true')
    await user.keyboard('{Escape}')
    expect(cabin.getAttribute('aria-expanded')).toBe('false')
    await user.click(travelers)
    await user.click(document.body)
    expect(travelers.getAttribute('aria-expanded')).toBe('false')
  })
})

function setup(): { onEdit: ReturnType<typeof vi.fn<(edit: IntentEdit) => void>> } {
  const onEdit = vi.fn<(edit: IntentEdit) => void>()
  render(
    createElement(ChipsRow, {
      intent,
      animations: new Map(),
      runId: 1,
      onEdit,
    }),
  )
  return { onEdit }
}
