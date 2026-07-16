import type { TripIntent } from '../schema/trip-intent'
import { datePart, wallClockMinutes } from './clock'
import { computePartyPrice } from './pricing'
import { bestMatch, rankOptions } from './rank'
import type {
  ExplanationFacts,
  FlightOption,
  OptionComparison,
} from './types'

export function explainOption(
  intent: TripIntent,
  options: readonly FlightOption[],
  optionId: string,
): ExplanationFacts {
  const option = options.find(({ id }) => id === optionId)
  if (!option) throw new Error(`Cannot explain unknown option: ${optionId}`)
  const travelers = intent.travelers ?? 1
  const cheapest = minimumOption(options, ({ pricing }) => pricing.priceUsd)
  const fastest = minimumOption(
    options,
    ({ totalDurationMinutes }) => totalDurationMinutes,
  )

  return {
    optionId: option.id,
    stops: option.segments.length - 1,
    totalDurationMinutes: option.totalDurationMinutes,
    price: computePartyPrice(option.pricing, travelers),
    isBestMatch: bestMatch(rankOptions(intent, options))?.id === option.id,
    isCheapest: cheapest.id === option.id,
    isFastest: fastest.id === option.id,
    arriveBy: intent.constraints.arriveBy,
    nonstopRequired: intent.constraints.nonstop === 'required',
    vsCheapest:
      cheapest.id === option.id
        ? null
        : compareOptions(option, cheapest, travelers),
    vsFastest:
      fastest.id === option.id
        ? null
        : compareOptions(option, fastest, travelers),
  }
}

function minimumOption(
  options: readonly FlightOption[],
  value: (option: FlightOption) => number,
): FlightOption {
  return options.reduce((minimum, option) => {
    const optionValue = value(option)
    const minimumValue = value(minimum)
    if (optionValue < minimumValue) return option
    if (optionValue === minimumValue && option.id < minimum.id) return option
    return minimum
  })
}

function compareOptions(
  option: FlightOption,
  reference: FlightOption,
  travelers: number,
): OptionComparison {
  const optionArrival = option.segments.at(-1)!.arriveLocal
  const referenceArrival = reference.segments.at(-1)!.arriveLocal
  const sameDepartureDay =
    datePart(option.segments[0].departLocal) ===
    datePart(reference.segments[0].departLocal)

  return {
    stopsDelta: option.segments.length - reference.segments.length,
    durationDeltaMinutes:
      option.totalDurationMinutes - reference.totalDurationMinutes,
    arrivalDeltaMinutes: sameDepartureDay
      ? wallClockMinutes(optionArrival) - wallClockMinutes(referenceArrival)
      : null,
    totalUsdDelta:
      computePartyPrice(option.pricing, travelers).totalUsd -
      computePartyPrice(reference.pricing, travelers).totalUsd,
  }
}
