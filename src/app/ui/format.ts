// Deterministic display formatting for the UI. Every number rendered here is
// engine-computed or user-stated; nothing comes from a model.

import type { FlightOption } from '../../lib/engine/types'
import type { IntentField } from '../../lib/schema/intent-diff'
import type { Cabin, DateWindow, TripIntent } from '../../lib/schema/trip-intent'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const CABIN_LABELS: Record<Cabin, string> = {
  economy: 'economy',
  premium_economy: 'premium economy',
  business: 'business',
  first: 'first',
}

export interface ChipView {
  field: IntentField
  label: string
  value: string
  assumed: boolean
}

export function chipsFromIntent(intent: TripIntent): ChipView[] {
  const chips: ChipView[] = []
  const add = (field: IntentField, label: string, value: string, assumed = false) =>
    chips.push({ field, label, value, assumed })

  if (intent.travelers !== null) add('travelers', 'Travelers', String(intent.travelers))
  if (intent.origin) {
    add('origin', 'From', `${intent.origin.iata} · ${intent.origin.city}`, intent.origin.assumed)
  }
  if (intent.destination) {
    add('destination', 'To', `${intent.destination.iata} · ${intent.destination.city}`)
  }
  if (intent.dates) add('dates', 'Dates', formatDateWindow(intent.dates))
  if (intent.cabin !== null) add('cabin', 'Cabin', CABIN_LABELS[intent.cabin])
  if (intent.priority !== null) add('priority', 'Priority', `${intent.priority} first`)

  const c = intent.constraints
  if (c.nonstop !== null) add('constraints.nonstop', 'Nonstop', c.nonstop)
  if (c.arriveBy !== null) add('constraints.arriveBy', 'Arrive by', c.arriveBy)
  if (c.departAfter !== null) add('constraints.departAfter', 'Depart after', c.departAfter)
  if (c.avoidRedeye !== null) {
    add('constraints.avoidRedeye', 'Red-eyes', c.avoidRedeye ? 'avoid' : 'fine')
  }
  if (c.avoidLateArrival !== null) {
    add('constraints.avoidLateArrival', 'Late arrival', c.avoidLateArrival ? 'avoid' : 'fine')
  }
  return chips
}

export function formatDateWindow(window: DateWindow): string {
  const [ey, em, ed] = isoParts(window.earliest)
  const [ly, lm, ld] = isoParts(window.latest)
  if (window.flexibility === 'exact') return `${MONTHS[em - 1]} ${ed}, ${ey}`

  const suffix = ' · flexible'
  if (ey === ly && em === lm) {
    if (ed === 1 && ld === lastDayOfMonth(ly, lm)) {
      return `${MONTHS[em - 1]} ${ey}${suffix}`
    }
    return `${MONTHS[em - 1]} ${ed} – ${ld}, ${ey}${suffix}`
  }
  if (ey === ly) {
    return `${MONTHS[em - 1]} ${ed} – ${MONTHS[lm - 1]} ${ld}, ${ey}${suffix}`
  }
  return `${MONTHS[em - 1]} ${ed}, ${ey} – ${MONTHS[lm - 1]} ${ld}, ${ly}${suffix}`
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatMiles(miles: number): string {
  return miles.toLocaleString('en-US')
}

export function departTime(option: FlightOption): string {
  return option.segments[0].departLocal.slice(11, 16)
}

export function arriveTime(option: FlightOption): string {
  return option.segments.at(-1)!.arriveLocal.slice(11, 16)
}

// Calendar-day offset between departure and final arrival (local dates).
export function arrivalDayOffset(option: FlightOption): number {
  const depart = option.segments[0].departLocal.slice(0, 10)
  const arrive = option.segments.at(-1)!.arriveLocal.slice(0, 10)
  return Math.round((utcMs(arrive) - utcMs(depart)) / 86_400_000)
}

export function stopsLabel(option: FlightOption): string {
  const stops = option.segments.length - 1
  if (stops === 0) return 'nonstop'
  const via = option.segments.slice(0, -1).map((s) => s.to).join(' · ')
  return `${stops === 1 ? '1 stop' : `${stops} stops`} · ${via}`
}

function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m, d]
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function utcMs(isoDate: string): number {
  const [y, m, d] = isoParts(isoDate)
  return Date.UTC(y, m - 1, d)
}
