interface LocalWallClock {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
}

const LOCAL_WALL_CLOCK_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/

// Minutes since local midnight for a 'YYYY-MM-DDTHH:MM' stamp.
export function timeOfDayMinutes(local: string): number {
  const { hour, minute } = parseLocalWallClock(local)
  return hour * 60 + minute
}

// Absolute minutes for a 'YYYY-MM-DDTHH:MM' stamp, treating it as if UTC.
// Valid only for differencing two stamps at the same airport.
export function wallClockMinutes(local: string): number {
  const { year, month, day, hour, minute } = parseLocalWallClock(local)
  return Date.UTC(year, month - 1, day, hour, minute) / 60_000
}

// The 'YYYY-MM-DD' date part.
export function datePart(local: string): string {
  parseLocalWallClock(local)
  return local.slice(0, 10)
}

function parseLocalWallClock(local: string): LocalWallClock {
  const match = LOCAL_WALL_CLOCK_PATTERN.exec(local)
  if (!match) throw new Error(`Invalid local wall-clock timestamp: ${local}`)

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }
}
