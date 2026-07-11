import type { TripIntent } from '../schema/trip-intent'
import { datePart, timeOfDayMinutes } from './clock'
import type { FlightOption } from './types'

export class GeneratorContractError extends Error {
  constructor(optionId: string, check: string) {
    super(`Option ${optionId} violates generator contract: ${check}`)
    this.name = 'GeneratorContractError'
  }
}

export function filterOptions(
  intent: TripIntent,
  options: readonly FlightOption[],
): FlightOption[] {
  return options.filter((option) => {
    assertGeneratorContract(intent, option)

    if (intent.cabin && option.cabin !== intent.cabin) return false
    if (
      intent.constraints.nonstop === 'required' &&
      option.segments.length !== 1
    ) {
      return false
    }

    const firstSegment = option.segments[0]
    const finalSegment = option.segments.at(-1)!
    const departureMinutes = timeOfDayMinutes(firstSegment.departLocal)
    const arrivalMinutes = timeOfDayMinutes(finalSegment.arriveLocal)

    if (
      intent.constraints.arriveBy &&
      arrivalMinutes > localTimeMinutes(intent.constraints.arriveBy)
    ) {
      return false
    }
    if (
      intent.constraints.departAfter &&
      departureMinutes < localTimeMinutes(intent.constraints.departAfter)
    ) {
      return false
    }
    if (
      intent.constraints.avoidRedeye === true &&
      (departureMinutes >= 22 * 60 || departureMinutes < 5 * 60)
    ) {
      return false
    }
    if (
      intent.constraints.avoidLateArrival === true &&
      arrivalMinutes < 5 * 60
    ) {
      return false
    }

    return true
  })
}

function localTimeMinutes(localTime: string): number {
  return timeOfDayMinutes(`2000-01-01T${localTime}`)
}

function assertGeneratorContract(
  intent: TripIntent,
  option: FlightOption,
): void {
  const firstSegment = option.segments[0]
  const finalSegment = option.segments.at(-1)!
  if (intent.origin && firstSegment.from !== intent.origin.iata) {
    throw new GeneratorContractError(option.id, 'origin')
  }
  if (intent.destination && finalSegment.to !== intent.destination.iata) {
    throw new GeneratorContractError(option.id, 'destination')
  }
  if (intent.dates) {
    const departureDate = datePart(firstSegment.departLocal)
    if (
      departureDate < intent.dates.earliest ||
      departureDate > intent.dates.latest
    ) {
      throw new GeneratorContractError(option.id, 'departure date')
    }
  }
}
