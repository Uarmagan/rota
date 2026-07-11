export const UTC_OFFSET_MINUTES: Readonly<Record<string, number>> = {
  ORD: -360,
  SFO: -480,
  JFK: -300,
  NRT: 540,
  LIS: 0,
  LHR: 0,
  CDG: 60,
}

export function addMinutes(local: string, minutes: number): string {
  const [datePart, timePart] = local.split('T')
  if (datePart === undefined || timePart === undefined) {
    throw new Error(`Invalid local datetime: ${local}`)
  }
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const timestamp = Date.UTC(year, month - 1, day, hour, minute) + minutes * 60_000
  const result = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(
    result.getUTCDate(),
  )}T${pad(result.getUTCHours())}:${pad(result.getUTCMinutes())}`
}

export function arrivalLocal(
  departLocal: string,
  durationMinutes: number,
  from: string,
  to: string,
): string {
  const fromOffset = UTC_OFFSET_MINUTES[from]
  const toOffset = UTC_OFFSET_MINUTES[to]
  if (fromOffset === undefined) throw new Error(`Unknown UTC offset for ${from}`)
  if (toOffset === undefined) throw new Error(`Unknown UTC offset for ${to}`)
  return addMinutes(departLocal, durationMinutes + toOffset - fromOffset)
}
