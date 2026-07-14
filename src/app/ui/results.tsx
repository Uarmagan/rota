'use client'

// One merged, rank-ordered list (M6 pivot: Google-Flights hierarchy, cash
// prices forward). Rows FLIP to their new position when a landing batch
// re-sorts the ranking — the re-rank must be legible, not jumpy.

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { computePartyPrice } from '../../lib/engine/pricing'
import type { FlightOption } from '../../lib/engine/types'
import {
  airlineLabel,
  arrivalDayOffset,
  arriveTime,
  departTime,
  formatDuration,
  formatUsd,
  layoverMinutes,
  stopsLabel,
} from './format'

export function Results({
  options,
  travelers,
  bestId,
  why,
  streaming,
  sourcesDone,
  sourcesTotal,
  hidden,
}: {
  options: readonly FlightOption[] // filtered, already in rank order
  travelers: number
  bestId: string | null
  why: { optionId: string; text: string } | null
  streaming: boolean
  sourcesDone: number
  sourcesTotal: number
  hidden: number
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const registerRow = useFlip()
  const enterDelays = useRef(new Map<string, number>())

  const fresh = options.filter((option) => !enterDelays.current.has(option.id))
  if (options.length === 0) enterDelays.current.clear()
  fresh.forEach((option, index) =>
    enterDelays.current.set(option.id, Math.min(index * 40, 240)),
  )

  useEffect(() => {
    if (expandedId !== null && !options.some((option) => option.id === expandedId)) {
      setExpandedId(null)
    }
  }, [expandedId, options])

  return (
    <div className="mt-7">
      <header className="mb-2 flex items-baseline justify-between text-[11px] text-neutral-500">
        <span>
          {options.length === 0 && streaming
            ? 'searching…'
            : `${options.length} option${options.length === 1 ? '' : 's'}`}
          {hidden > 0 && (
            <span className="text-neutral-600">
              {' '}
              · {hidden} hidden by your filters
            </span>
          )}
        </span>
        <span className={streaming ? 'text-indigo-300/70' : 'text-neutral-600'}>
          {sourcesDone}/{sourcesTotal} sources
        </span>
      </header>

      {options.map((option) => (
        <Row
          key={option.id}
          ref={registerRow(option.id)}
          option={option}
          travelers={travelers}
          isBest={bestId === option.id}
          enterDelayMs={enterDelays.current.get(option.id) ?? 0}
          expanded={expandedId === option.id}
          onToggle={() =>
            setExpandedId((current) => (current === option.id ? null : option.id))
          }
          whyLine={
            why !== null && why.optionId === option.id && bestId === option.id
              ? why.text
              : null
          }
        />
      ))}

      {streaming && (
        <div className="mt-2 space-y-2">
          {options.length === 0 ? (
            <>
              <div className="rota-shimmer h-14 rounded-md" />
              <div className="rota-shimmer h-14 rounded-md" />
              <div className="rota-shimmer h-14 rounded-md" />
            </>
          ) : (
            <div className="rota-shimmer h-14 rounded-md" />
          )}
        </div>
      )}

      {!streaming && options.length === 0 && hidden === 0 && (
        <p className="py-3 text-sm text-neutral-600">No seats for this search.</p>
      )}
    </div>
  )
}

// FLIP over layout positions (offsetTop ignores in-flight transforms, so an
// interrupted move re-measures from its true layout slot).
function useFlip() {
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const tops = useRef(new Map<string, number>())
  const moves = useRef(new Map<string, Animation>())

  useLayoutEffect(() => {
    // matchMedia/animate are absent under jsdom; FLIP is a browser-only flourish.
    const reduceMotion =
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const nextTops = new Map<string, number>()
    for (const [id, el] of nodes.current) nextTops.set(id, el.offsetTop)
    if (!reduceMotion) {
      for (const [id, el] of nodes.current) {
        const before = tops.current.get(id)
        if (before === undefined) continue
        const dy = before - nextTops.get(id)!
        if (Math.abs(dy) < 2) continue
        moves.current.get(id)?.cancel()
        moves.current.set(
          id,
          el.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
            { duration: 280, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' },
          ),
        )
      }
    }
    tops.current = nextTops
  })

  return (id: string) => (el: HTMLDivElement | null) => {
    if (el) nodes.current.set(id, el)
    else {
      nodes.current.delete(id)
      moves.current.delete(id)
    }
  }
}

function Row({
  ref,
  option,
  travelers,
  isBest,
  enterDelayMs,
  expanded,
  onToggle,
  whyLine,
}: {
  ref: (el: HTMLDivElement | null) => void
  option: FlightOption
  travelers: number
  isBest: boolean
  enterDelayMs: number
  expanded: boolean
  onToggle: () => void
  whyLine: string | null
}) {
  const price = computePartyPrice(option.pricing, travelers)
  const dayOffset = arrivalDayOffset(option)
  const detailsId = `result-details-${option.id}`

  return (
    <div
      ref={ref}
      style={{ animationDelay: `${enterDelayMs}ms` }}
      className={`rota-row border-b border-white/5 transition-colors hover:bg-white/[0.03] ${
        isBest
          ? 'border-l-2 border-l-indigo-400 bg-indigo-400/[0.04]'
          : 'border-l-2 border-l-transparent'
      }`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-5 py-3 pr-2 pl-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
      >
        <span>
          <span className="block text-[15px] font-medium text-neutral-100 tabular-nums">
            {departTime(option)} → {arriveTime(option)}
            {dayOffset > 0 && (
              <sup className="text-[9px] text-neutral-500">+{dayOffset}</sup>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            {airlineLabel(option)}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-xs text-neutral-300">
            {formatDuration(option.totalDurationMinutes)}
          </span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            {stopsLabel(option)}
          </span>
        </span>
        <span className="w-24 text-right">
          <span className="block text-base font-semibold text-neutral-50 tabular-nums">
            {formatUsd(price.totalUsd)}
          </span>
          {isBest && (
            <span
              key={option.id}
              className="rota-badge inline-block rounded bg-indigo-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300"
            >
              ★ BEST
            </span>
          )}
        </span>
      </button>

      <div
        className={`rota-expand grid ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div
            id={detailsId}
            role="region"
            aria-label={`Details for ${option.id}`}
            aria-hidden={!expanded}
            className="px-3 pb-3 text-xs text-neutral-400"
          >
            <ol className="space-y-1">
              {option.segments.map((segment, index) => (
                <Fragment key={`${segment.flight}-${index}`}>
                  {index > 0 && (
                    <li className="text-neutral-600">
                      {formatDuration(
                        layoverMinutes(
                          option.segments[index - 1].arriveLocal,
                          segment.departLocal,
                        ),
                      )}{' '}
                      layover in {segment.from}
                    </li>
                  )}
                  <li>
                    <span className="font-medium text-neutral-200">
                      {segment.flight}
                    </span>
                    <span className="text-neutral-600"> · </span>
                    {segment.from} {segment.departLocal.slice(11, 16)} →{' '}
                    {segment.to} {segment.arriveLocal.slice(11, 16)}
                  </li>
                </Fragment>
              ))}
            </ol>
            <p className="mt-2 text-neutral-500">
              {option.cabin.replace('_', ' ')}
              {travelers > 1 &&
                ` · ${formatUsd(computePartyPrice(option.pricing, 1).totalUsd)} per traveler · ${formatUsd(price.totalUsd)} total for ${travelers}`}
            </p>
            {expanded && whyLine !== null && (
              <p className="mt-2 max-w-lg leading-relaxed text-neutral-400">
                {whyLine}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
