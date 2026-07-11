import type { ExplanationFacts, OptionComparison } from '../engine/types'

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return [hours > 0 ? `${hours}h` : '', remainder > 0 ? `${remainder}m` : '']
    .filter(Boolean)
    .join(' ')
}

export function formatMiles(miles: number): string {
  return miles.toLocaleString('en-US')
}

export function renderStops(stops: number): string {
  if (stops === 0) return 'nonstop'
  return stops === 1 ? '1 stop' : `${stops} stops`
}

export function renderComparison(comparison: OptionComparison): string {
  return [
    renderDelta(comparison.stopsDelta, 'stop', 'more', 'fewer', 'same stops'),
    renderDurationDelta(comparison.durationDeltaMinutes, 'slower', 'faster'),
    renderArrivalDelta(comparison.arrivalDeltaMinutes),
    renderMilesDelta(comparison.totalMilesDelta),
  ].join('; ')
}

export function renderFacts(facts: ExplanationFacts): string {
  const badges = [
    facts.isBestMatch ? 'best match' : '',
    facts.isCheapest ? 'cheapest' : '',
    facts.isFastest ? 'fastest' : '',
  ].filter(Boolean)
  const lines = [
    `stops: ${renderStops(facts.stops)}`,
    `duration: ${formatDuration(facts.totalDurationMinutes)}`,
    `price: ${formatMiles(facts.price.totalMiles)} miles + $${facts.price.totalFeesUsd} (${facts.price.program})`,
    `badges: ${badges.join(', ') || 'none'}`,
  ]
  if (facts.arriveBy !== null) lines.push(`arrive-by deadline: ${facts.arriveBy}`)
  if (facts.nonstopRequired) lines.push('nonstop required: yes')
  if (facts.vsCheapest !== null) {
    lines.push(`vs cheapest: ${renderComparison(facts.vsCheapest)}`)
  }
  if (facts.vsFastest !== null) {
    lines.push(`vs fastest: ${renderComparison(facts.vsFastest)}`)
  }
  return lines.join('\n')
}

export function fallbackLine(facts: ExplanationFacts): string {
  const lead = facts.isBestMatch
    ? 'Best match for your search.'
    : facts.isCheapest
      ? 'The cheapest option in this set.'
      : facts.isFastest
        ? 'The fastest option in this set.'
        : 'A solid option.'
  const stops = renderStops(facts.stops)
  const capitalizedStops = stops[0].toUpperCase() + stops.slice(1)
  return (
    `${lead} ${capitalizedStops}, ${formatDuration(facts.totalDurationMinutes)}, ` +
    `${formatMiles(facts.price.totalMiles)} miles + $${facts.price.totalFeesUsd}.`
  )
}

function renderDelta(
  delta: number,
  unit: string,
  positive: string,
  negative: string,
  same: string,
): string {
  if (delta === 0) return same
  const count = Math.abs(delta)
  return `${count} ${delta > 0 ? positive : negative} ${unit}${count === 1 ? '' : 's'}`
}

function renderDurationDelta(
  delta: number,
  positive: string,
  negative: string,
): string {
  if (delta === 0) return 'same duration'
  return `${formatDuration(Math.abs(delta))} ${delta > 0 ? positive : negative}`
}

function renderArrivalDelta(delta: number): string {
  if (delta === 0) return 'arrives at the same time'
  return `arrives ${formatDuration(Math.abs(delta))} ${delta > 0 ? 'later' : 'earlier'}`
}

function renderMilesDelta(delta: number): string {
  if (delta === 0) return 'same miles'
  return `${formatMiles(Math.abs(delta))} ${delta > 0 ? 'more' : 'fewer'} miles`
}
