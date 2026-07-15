import { describe, expect, it } from 'vitest'
import type { Constraints } from '../schema/trip-intent'
import { GeneratorContractError, filterOptions } from './filter'
import { makeIntent, makeOption } from './test-support'

function makeConnectingOption() {
  return makeOption({
    id: 'connecting',
    segments: [
      {
        from: 'SFO',
        to: 'LAX',
        departLocal: '2027-02-10T10:00',
        arriveLocal: '2027-02-10T11:30',
        flight: 'UA 101',
      },
      {
        from: 'LAX',
        to: 'NRT',
        departLocal: '2027-02-10T13:00',
        arriveLocal: '2027-02-11T17:00',
        flight: 'NH 202',
      },
    ],
  })
}

function makeIntentWithConstraints(overrides: Partial<Constraints>) {
  return makeIntent({
    constraints: {
      nonstop: null,
      arriveBy: null,
      departAfter: null,
      avoidRedeye: null,
      avoidLateArrival: null,
      ...overrides,
    },
  })
}

function makeTimedOption(
  departLocal: string,
  arriveLocal: string,
  id = 'timed',
) {
  return makeOption({
    id,
    segments: [
      {
        from: 'SFO',
        to: 'NRT',
        departLocal,
        arriveLocal,
        flight: 'NH 11',
      },
    ],
  })
}

describe('filterOptions generator contract', () => {
  it('rejects an option whose origin does not match the intent', () => {
    const intent = makeIntent({
      origin: { iata: 'ORD', city: 'Chicago', assumed: false },
    })

    expect(() => filterOptions(intent, [makeOption()])).toThrow(
      GeneratorContractError,
    )
    expect(() => filterOptions(intent, [makeOption()])).toThrow(
      'opt-1',
    )
  })

  it('rejects an option whose destination does not match the intent', () => {
    const intent = makeIntent({
      destination: { iata: 'LHR', city: 'London', assumed: false },
    })

    expect(() => filterOptions(intent, [makeOption()])).toThrow(
      GeneratorContractError,
    )
  })

  it('rejects an option outside the requested date window', () => {
    const intent = makeIntent({
      dates: {
        earliest: '2027-02-11',
        latest: '2027-02-14',
        flexibility: 'flexible',
      },
    })

    expect(() => filterOptions(intent, [makeOption()])).toThrow(
      GeneratorContractError,
    )
  })

  it('does not assert route or date fields that are null', () => {
    const option = makeOption({
      segments: [
        {
          from: 'XXX',
          to: 'YYY',
          departLocal: '2030-01-01T10:00',
          arriveLocal: '2030-01-01T12:00',
          flight: 'UA 1',
        },
      ],
    })

    expect(filterOptions(makeIntent(), [option])).toEqual([option])
  })
})

describe('filterOptions cabin and nonstop gates', () => {
  it('keeps only the exact requested cabin', () => {
    const economy = makeOption({ id: 'economy' })
    const business = makeOption({ id: 'business', cabin: 'business' })

    expect(
      filterOptions(makeIntent({ cabin: 'business' }), [economy, business]),
    ).toEqual([business])
  })

  it('does not gate cabin when the intent field is null', () => {
    const business = makeOption({ cabin: 'business' })

    expect(filterOptions(makeIntent(), [business])).toEqual([business])
  })

  it('drops connections when nonstop is required', () => {
    const nonstop = makeOption({ id: 'nonstop' })
    const connecting = makeConnectingOption()
    const intent = makeIntent({
      constraints: {
        nonstop: 'required',
        arriveBy: null,
        departAfter: null,
        avoidRedeye: null,
        avoidLateArrival: null,
      },
    })

    expect(filterOptions(intent, [connecting, nonstop])).toEqual([nonstop])
  })

  it('keeps connections when nonstop is preferred or unstated', () => {
    const connecting = makeConnectingOption()
    const preferred = makeIntent({
      constraints: {
        nonstop: 'preferred',
        arriveBy: null,
        departAfter: null,
        avoidRedeye: null,
        avoidLateArrival: null,
      },
    })

    expect(filterOptions(preferred, [connecting])).toEqual([connecting])
    expect(filterOptions(makeIntent(), [connecting])).toEqual([connecting])
  })
})

describe('filterOptions local-time gates', () => {
  it('keeps arrivals at or before the arrive-by deadline', () => {
    const atDeadline = makeTimedOption(
      '2027-02-10T10:00',
      '2027-02-11T17:00',
      'at-deadline',
    )
    const afterDeadline = makeTimedOption(
      '2027-02-10T10:00',
      '2027-02-11T17:01',
      'after-deadline',
    )

    expect(
      filterOptions(makeIntentWithConstraints({ arriveBy: '17:00' }), [
        atDeadline,
        afterDeadline,
      ]),
    ).toEqual([atDeadline])
  })

  it('treats a small-hours arrival as earlier than a daytime deadline', () => {
    const smallHours = makeTimedOption(
      '2027-02-10T10:00',
      '2027-02-11T00:30',
    )

    expect(
      filterOptions(makeIntentWithConstraints({ arriveBy: '17:00' }), [
        smallHours,
      ]),
    ).toEqual([smallHours])
  })

  it('keeps departures at or after the depart-after threshold', () => {
    const beforeThreshold = makeTimedOption(
      '2027-02-10T08:59',
      '2027-02-11T14:00',
      'before-threshold',
    )
    const atThreshold = makeTimedOption(
      '2027-02-10T09:00',
      '2027-02-11T14:00',
      'at-threshold',
    )

    expect(
      filterOptions(makeIntentWithConstraints({ departAfter: '09:00' }), [
        beforeThreshold,
        atThreshold,
      ]),
    ).toEqual([atThreshold])
  })

  it.each([
    ['2027-02-10T21:59', true],
    ['2027-02-10T22:00', false],
    ['2027-02-10T04:59', false],
    ['2027-02-10T05:00', true],
  ])(
    'applies the red-eye boundary to a %s departure',
    (departLocal, survives) => {
      const option = makeTimedOption(departLocal, '2027-02-11T14:00')
      const result = filterOptions(
        makeIntentWithConstraints({ avoidRedeye: true }),
        [option],
      )

      expect(result).toEqual(survives ? [option] : [])
    },
  )

  it.each([
    ['2027-02-11T04:59', false],
    ['2027-02-11T05:00', true],
  ])(
    'applies the small-hours boundary to a %s arrival',
    (arriveLocal, survives) => {
      const option = makeTimedOption('2027-02-10T10:00', arriveLocal)
      const result = filterOptions(
        makeIntentWithConstraints({ avoidLateArrival: true }),
        [option],
      )

      expect(result).toEqual(survives ? [option] : [])
    },
  )

  it('does not gate red-eyes or late arrivals when explicitly allowed', () => {
    const option = makeTimedOption(
      '2027-02-10T23:00',
      '2027-02-11T04:00',
    )
    const explicitlyAllowed = makeIntentWithConstraints({
      avoidRedeye: false,
      avoidLateArrival: false,
    })

    expect(filterOptions(explicitlyAllowed, [option])).toEqual([option])
    expect(filterOptions(makeIntent(), [option])).toEqual([option])
  })
})

describe('filterOptions composition', () => {
  it('requires an option to survive every active constraint', () => {
    const survives = makeTimedOption(
      '2027-02-10T09:00',
      '2027-02-11T16:00',
      'survives',
    )
    const leavesTooEarly = makeTimedOption(
      '2027-02-10T08:59',
      '2027-02-11T16:00',
      'leaves-too-early',
    )
    const arrivesTooLate = makeTimedOption(
      '2027-02-10T09:00',
      '2027-02-11T17:01',
      'arrives-too-late',
    )
    const intent = makeIntentWithConstraints({
      nonstop: 'required',
      arriveBy: '17:00',
      departAfter: '09:00',
      avoidRedeye: true,
      avoidLateArrival: true,
    })

    expect(
      filterOptions(intent, [leavesTooEarly, survives, arrivesTooLate]),
    ).toEqual([survives])
  })

  it('preserves survivor order without mutating the input array', () => {
    const first = makeOption({ id: 'first' })
    const dropped = makeOption({ id: 'dropped', cabin: 'business' })
    const last = makeOption({ id: 'last' })
    const options = [first, dropped, last]

    expect(filterOptions(makeIntent({ cabin: 'economy' }), options)).toEqual([
      first,
      last,
    ])
    expect(options).toEqual([first, dropped, last])
  })

  it('does not consult the traveler count', () => {
    const option = makeOption()

    expect(filterOptions(makeIntent({ travelers: 9 }), [option])).toEqual([
      option,
    ])
  })
})
