'use client'

import { computeAwardPrice } from '../../lib/engine/pricing'
import type { FlightOption } from '../../lib/engine/types'
import {
  arrivalDayOffset,
  arriveTime,
  departTime,
  formatDuration,
  formatMiles,
  stopsLabel,
} from './format'

export interface SourceView {
  id: string
  program: string
  options: readonly FlightOption[]
  hidden: number
  status: 'searching' | 'partial' | 'done'
}

export function Results({
  sources,
  travelers,
  bestId,
  why,
}: {
  sources: readonly SourceView[]
  travelers: number
  bestId: string | null
  why: { optionId: string; text: string } | null
}) {
  return (
    <div className="mt-8">
      {sources.map((source) => (
        <section key={source.id} className="mb-7">
          <header className="mb-1 flex items-baseline justify-between">
            <h2 className="text-[10px] font-semibold tracking-[0.2em] text-neutral-500 uppercase">
              {source.id}
            </h2>
            <span className="text-[10px] text-neutral-600">
              {source.status === 'searching' ? 'searching…' : source.program}
            </span>
          </header>

          {source.status === 'searching' ? (
            <div className="space-y-2 pt-1">
              <div className="rota-shimmer h-10 rounded-md" />
              <div className="rota-shimmer h-10 rounded-md" />
            </div>
          ) : (
            <>
              {source.options.map((option) => (
                <Row
                  key={option.id}
                  option={option}
                  travelers={travelers}
                  isBest={bestId === option.id}
                  whyLine={
                    why !== null && why.optionId === option.id && bestId === option.id
                      ? why.text
                      : null
                  }
                />
              ))}
              {source.status === 'partial' && (
                <div className="rota-shimmer mt-2 h-10 rounded-md" />
              )}
              {source.status === 'done' &&
                source.options.length === 0 &&
                (source.hidden === 0 ? (
                  <p className="border-b border-white/5 py-3 text-sm text-neutral-600">
                    No seats for this search.
                  </p>
                ) : null)}
              {source.hidden > 0 && (
                <p className="pt-1.5 text-[11px] text-neutral-600">
                  {source.hidden} option{source.hidden === 1 ? '' : 's'} hidden by
                  your filters
                </p>
              )}
            </>
          )}
        </section>
      ))}
    </div>
  )
}

function Row({
  option,
  travelers,
  isBest,
  whyLine,
}: {
  option: FlightOption
  travelers: number
  isBest: boolean
  whyLine: string | null
}) {
  const price = computeAwardPrice(option.pricing, travelers)
  const dayOffset = arrivalDayOffset(option)

  return (
    <div
      className={`rota-row border-b border-white/5 py-3 pl-3 transition-colors hover:bg-white/[0.03] ${
        isBest
          ? 'border-l-2 border-l-indigo-400 bg-indigo-400/[0.04]'
          : 'border-l-2 border-l-transparent'
      }`}
    >
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-6">
        <div>
          <span className="font-medium text-neutral-100 tabular-nums">
            {departTime(option)} → {arriveTime(option)}
            {dayOffset > 0 && (
              <sup className="text-[9px] text-neutral-500">+{dayOffset}</sup>
            )}
          </span>
          <span className="ml-3 text-xs text-neutral-500">
            {formatDuration(option.totalDurationMinutes)} · {stopsLabel(option)}
          </span>
        </div>
        <span className="text-sm text-neutral-300 tabular-nums">
          {formatMiles(price.totalMiles)}{' '}
          <span className="text-neutral-500">mi</span> +{' '}
          <span className="text-neutral-400">${price.totalFeesUsd}</span>
        </span>
        <span className="w-14 text-right">
          {isBest && (
            <span
              key={option.id}
              className="rota-badge inline-block rounded bg-indigo-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300"
            >
              ★ BEST
            </span>
          )}
        </span>
      </div>
      {whyLine !== null && (
        <p className="rota-row mt-1.5 max-w-lg text-xs leading-relaxed text-neutral-500">
          {whyLine}
        </p>
      )}
    </div>
  )
}
