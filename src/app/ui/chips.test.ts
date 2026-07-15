// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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

afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'innerWidth', {
    value: 1024,
    configurable: true,
  })
})

describe('ChipsRow', () => {
  it('edits a simple choice through a checked one-step menu', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /travelers.*2/i }))

    expect(await screen.findByRole('menu')).toBeTruthy()
    expect(screen.getByRole('menuitemradio', { name: '2 travelers', checked: true })).toBeTruthy()

    await user.click(screen.getByRole('menuitemradio', { name: '4 travelers' }))
    expect(onEdit).toHaveBeenLastCalledWith({ field: 'travelers', value: 4 })
  })

  it('searches airports by city or IATA before applying a selection', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: /from.*ORD.*assumed/i }))
    const search = await screen.findByRole('combobox', { name: 'Search airports' })
    await user.clear(search)
    await user.type(search, 'SFO')

    const option = await screen.findByRole('option', {
      name: /San Francisco.*SFO/i,
    })
    expect(screen.queryByRole('option', { name: /Tokyo.*NRT/i })).toBeNull()

    await user.click(option)
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'origin',
      value: { iata: 'SFO', city: 'San Francisco' },
    })
  })

  it('moves complex airport editing into a mobile drawer', async () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 375,
      configurable: true,
    })
    const { onEdit } = setup()
    const user = userEvent.setup()

    const trigger = await screen.findByRole('button', {
      name: /from.*ORD.*assumed/i,
    })
    await user.click(trigger)
    const drawer = await screen.findByRole('dialog', { name: 'Edit From' })
    const search = within(drawer).getByRole('combobox', {
      name: 'Search airports',
    })
    await user.clear(search)
    await user.type(search, 'LIS')
    await user.click(within(drawer).getByRole('option', { name: /Lisbon.*LIS/i }))

    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'origin',
      value: { iata: 'LIS', city: 'Lisbon' },
    })
  })

  it('edits travelers, origin, destination, and cabin through accessible controls', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /travelers.*2/i }))
    await user.click(await screen.findByRole('menuitemradio', { name: '4 travelers' }))
    expect(onEdit).toHaveBeenLastCalledWith({ field: 'travelers', value: 4 })

    await user.click(screen.getByRole('combobox', { name: /from.*ORD.*assumed/i }))
    await user.click(await screen.findByRole('option', { name: /Chicago.*ORD.*confirm/i }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'origin',
      value: { iata: 'ORD', city: 'Chicago' },
    })

    await user.click(screen.getByRole('combobox', { name: /to.*NRT/i }))
    await user.click(await screen.findByRole('option', { name: /Lisbon.*LIS/i }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'destination',
      value: { iata: 'LIS', city: 'Lisbon' },
    })

    await user.click(screen.getByRole('button', { name: /cabin.*economy/i }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'business' }))
    expect(onEdit).toHaveBeenLastCalledWith({ field: 'cabin', value: 'business' })
  })

  it('applies exact and ordered flexible date edits', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /dates.*Feb 3/i }))
    const panel = await screen.findByRole('dialog', { name: 'Edit Dates' })
    expect(within(panel).getByRole('button', { name: 'Exact', pressed: true })).toBeTruthy()
    await user.click(within(panel).getByRole('button', { name: /Monday, February 8th, 2027/i }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'dates',
      value: {
        earliest: '2027-02-08',
        latest: '2027-02-08',
        flexibility: 'exact',
      },
    })

    await user.click(screen.getByRole('button', { name: /dates.*Feb 3/i }))
    const flexiblePanel = await screen.findByRole('dialog', { name: 'Edit Dates' })
    await user.click(within(flexiblePanel).getByRole('button', { name: 'Flexible' }))
    await user.click(
      within(flexiblePanel).getByRole('button', {
        name: /Wednesday, February 10th, 2027/i,
      }),
    )
    expect(onEdit).toHaveBeenCalledTimes(1)
    await user.click(
      within(flexiblePanel).getByRole('button', {
        name: /Sunday, February 14th, 2027/i,
      }),
    )
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'dates',
      value: {
        earliest: '2027-02-10',
        latest: '2027-02-14',
        flexibility: 'flexible',
      },
    })
  })

  it('reapplies the selected exact date instead of treating it as a clear', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /dates.*Feb 3/i }))
    const panel = await screen.findByRole('dialog', { name: 'Edit Dates' })
    await user.click(
      within(panel).getByRole('button', {
        name: /Wednesday, February 3rd, 2027, selected/i,
      }),
    )

    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'dates',
      value: {
        earliest: '2027-02-03',
        latest: '2027-02-03',
        flexibility: 'exact',
      },
    })
  })

  it('applies time edits explicitly and clears nullable deadlines', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /arrive by.*17:00/i }))
    const panel = await screen.findByRole('dialog', { name: 'Edit Arrive by' })
    const input = within(panel).getByLabelText('Arrive by')
    await user.clear(input)
    await user.type(input, '19:30')
    expect(onEdit).not.toHaveBeenCalled()

    await user.click(within(panel).getByRole('button', { name: 'Apply' }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'constraints.arriveBy',
      value: '19:30',
    })

    await user.click(screen.getByRole('button', { name: /arrive by.*17:00/i }))
    const reopened = await screen.findByRole('dialog', { name: 'Edit Arrive by' })
    await user.click(within(reopened).getByRole('button', { name: 'Clear' }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'constraints.arriveBy',
      value: null,
    })
  })

  it('edits priority and every constraint family', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()
    const cases: readonly [RegExp, string, IntentEdit][] = [
      [/priority.*cheapest/i, 'Fastest first', { field: 'priority', value: 'fastest' }],
      [
        /nonstop.*preferred/i,
        'Required',
        {
          field: 'constraints.nonstop',
          value: 'required',
        },
      ],
      [
        /red-eyes.*avoid/i,
        'Fine',
        {
          field: 'constraints.avoidRedeye',
          value: false,
        },
      ],
      [
        /late arrival.*fine/i,
        'Avoid',
        {
          field: 'constraints.avoidLateArrival',
          value: true,
        },
      ],
    ]

    for (const [chipName, optionName, expected] of cases) {
      await user.click(screen.getByRole('button', { name: chipName }))
      await user.click(await screen.findByRole('menuitemradio', { name: optionName }))
      expect(onEdit).toHaveBeenLastCalledWith(expected)
    }

    await user.click(screen.getByRole('button', { name: /arrive by.*17:00/i }))
    const arrivePanel = await screen.findByRole('dialog', { name: 'Edit Arrive by' })
    const arrive = within(arrivePanel).getByLabelText('Arrive by')
    await user.clear(arrive)
    await user.type(arrive, '19:30')
    await user.click(within(arrivePanel).getByRole('button', { name: 'Apply' }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'constraints.arriveBy',
      value: '19:30',
    })

    await user.click(screen.getByRole('button', { name: /depart after.*09:00/i }))
    const departPanel = await screen.findByRole('dialog', {
      name: 'Edit Depart after',
    })
    const depart = within(departPanel).getByLabelText('Depart after')
    await user.clear(depart)
    await user.type(depart, '10:15')
    await user.click(within(departPanel).getByRole('button', { name: 'Apply' }))
    expect(onEdit).toHaveBeenLastCalledWith({
      field: 'constraints.departAfter',
      value: '10:15',
    })
  })

  it('offers Clear only for semantically removable fields', async () => {
    const { onEdit } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /travelers/i }))
    await screen.findByRole('menu')
    expect(screen.queryByText('Clear')).toBeNull()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('combobox', { name: /from/i }))
    await screen.findByRole('combobox', { name: 'Search airports' })
    expect(screen.queryByText('Clear')).toBeNull()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: /cabin/i }))
    await screen.findByRole('menu')
    expect(screen.queryByText('Clear')).toBeNull()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('combobox', { name: /to.*NRT/i }))
    await screen.findByRole('combobox', { name: 'Search airports' })
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onEdit).toHaveBeenLastCalledWith({ field: 'destination', value: null })

    await user.click(screen.getByRole('button', { name: /dates.*Feb 3/i }))
    const dates = await screen.findByRole('dialog', { name: 'Edit Dates' })
    await user.click(within(dates).getByRole('button', { name: 'Clear' }))
    expect(onEdit).toHaveBeenLastCalledWith({ field: 'dates', value: null })

    await user.click(screen.getByRole('button', { name: /nonstop/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Clear' }))
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
    await screen.findByRole('menu')
    expect(travelers.getAttribute('aria-expanded')).toBe('true')
    await user.click(cabin)
    await waitFor(() => expect(travelers.getAttribute('aria-expanded')).toBe('false'))
    await waitFor(() => expect(cabin.getAttribute('aria-expanded')).toBe('true'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(cabin.getAttribute('aria-expanded')).toBe('false'))
    await user.click(travelers)
    await screen.findByRole('menu')
    await user.click(document.body)
    await waitFor(() => expect(travelers.getAttribute('aria-expanded')).toBe('false'))
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
