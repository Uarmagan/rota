'use client'

// One merged, rank-ordered list (M6 pivot: Google-Flights hierarchy, cash
// prices forward). Rows FLIP to their new position when a landing batch
// re-sorts the ranking — the re-rank must be legible, not jumpy.

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
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

const EXPAND_MS = 200 // keep in sync with the .rota-expand duration in search.css
const FLIP_MS = 280

// jsdom has no matchMedia; treat that as reduced motion, like useFlip does.
function motionOk(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

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
  const collapseTimer = useRef<number | null>(null)

  const clearPendingExpand = () => {
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
  }
  useEffect(() => clearPendingExpand, [])

  // Switching rows: let the open section finish closing before the target opens.
  const toggleExpanded = (id: string) => {
    clearPendingExpand()
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    if (expandedId === null) {
      setExpandedId(id)
      return
    }
    setExpandedId(null)
    const animated =
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!animated) {
      setExpandedId(id)
      return
    }
    collapseTimer.current = window.setTimeout(() => {
      collapseTimer.current = null
      setExpandedId(id)
    }, EXPAND_MS)
  }

  const orderKey = options.map((option) => option.id).join('|')
  const registerRow = useFlip(orderKey)
  const animation = useAnimationBookkeeping(options, bestId, streaming)

  useEffect(() => {
    if (expandedId !== null && !options.some((option) => option.id === expandedId)) {
      setExpandedId(null)
    }
  }, [expandedId, options])

  return (
    <div className="mt-7">
      <header className="mb-2 flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span>
          {options.length === 0 && streaming
            ? 'searching…'
            : `${options.length} option${options.length === 1 ? '' : 's'}`}
          {hidden > 0 && (
            <span> · {hidden} hidden by your filters</span>
          )}
        </span>
        <span className={streaming ? 'text-cyan-300/80' : ''}>
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
          enterDelayMs={animation.enterDelays.get(option.id) ?? 0}
          badgeDelayMs={animation.crownDelayMs}
          verdict={animation.verdictId === option.id}
          expanded={expandedId === option.id}
          onToggle={() => toggleExpanded(option.id)}
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
            <div
              ref={registerRow('__shimmer')}
              className="rota-shimmer h-14 rounded-md"
            />
          )}
        </div>
      )}

      {!streaming && options.length === 0 && hidden === 0 && (
        <p className="py-3 text-sm text-neutral-600">No seats for this search.</p>
      )}
    </div>
  )
}

interface AnimationBookkeeping {
  enterDelays: ReadonlyMap<string, number>
  crownId: string | null
  crownDelayMs: number
  streamed: boolean
  verdictId: string | null
}

const EMPTY_ANIMATION_BOOKKEEPING: AnimationBookkeeping = {
  enterDelays: new Map(),
  crownId: null,
  crownDelayMs: 0,
  streamed: false,
  verdictId: null,
}

function useAnimationBookkeeping(
  options: readonly FlightOption[],
  bestId: string | null,
  streaming: boolean,
): AnimationBookkeeping {
  const [committed, setCommitted] = useState(EMPTY_ANIMATION_BOOKKEEPING)
  const next = deriveAnimationBookkeeping(
    committed,
    options.map((option) => option.id),
    bestId,
    streaming,
    motionOk(),
  )

  useLayoutEffect(() => {
    setCommitted((current) =>
      animationBookkeepingEqual(current, next) ? current : next,
    )
  }, [next])

  return next
}

function deriveAnimationBookkeeping(
  committed: AnimationBookkeeping,
  optionIds: readonly string[],
  bestId: string | null,
  streaming: boolean,
  animated: boolean,
): AnimationBookkeeping {
  if (optionIds.length === 0) {
    return {
      ...EMPTY_ANIMATION_BOOKKEEPING,
      enterDelays: new Map(),
      streamed: streaming,
    }
  }

  const enterDelays = new Map(committed.enterDelays)
  const firstPaint = enterDelays.size === 0
  optionIds.forEach((id, index) => {
    if (!enterDelays.has(id)) {
      enterDelays.set(id, animated && firstPaint ? Math.min(index * 30, 600) : 0)
    }
  })

  const crownChanged = bestId !== committed.crownId
  const crownDelayMs = animated
    ? crownChanged && committed.crownId !== null
      ? FLIP_MS
      : committed.crownDelayMs
    : 0

  let streamed = committed.streamed
  let verdictId = committed.verdictId
  if (streaming) {
    streamed = true
    verdictId = null
  } else if (committed.streamed && bestId !== null) {
    streamed = false
    verdictId = bestId
  }

  return {
    enterDelays,
    crownId: bestId,
    crownDelayMs,
    streamed,
    verdictId,
  }
}

function animationBookkeepingEqual(
  left: AnimationBookkeeping,
  right: AnimationBookkeeping,
): boolean {
  if (
    left.crownId !== right.crownId ||
    left.crownDelayMs !== right.crownDelayMs ||
    left.streamed !== right.streamed ||
    left.verdictId !== right.verdictId ||
    left.enterDelays.size !== right.enterDelays.size
  ) {
    return false
  }
  for (const [id, delay] of left.enterDelays) {
    if (right.enterDelays.get(id) !== delay) return false
  }
  return true
}

// WAAPI easing can't reference CSS vars; read --ease-in-out-strong once.
let flipEasing: string | null = null
function getFlipEasing(): string {
  if (flipEasing === null) {
    const token =
      typeof window === 'undefined'
        ? ''
        : getComputedStyle(document.documentElement)
            .getPropertyValue('--ease-in-out-strong')
            .trim()
    flipEasing = token !== '' ? token : 'cubic-bezier(0.77, 0, 0.175, 1)'
  }
  return flipEasing
}

// FLIP over layout positions (offsetTop ignores in-flight transforms, so an
// interrupted move re-measures from its true layout slot).
function useFlip(orderKey: string) {
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const tops = useRef(new Map<string, number>())
  const moves = useRef(new Map<string, Animation>())
  const lastOrder = useRef<string | null>(null)

  useLayoutEffect(() => {
    // matchMedia/animate are absent under jsdom; FLIP is a browser-only flourish.
    const reduceMotion =
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Only re-ranks FLIP; expand/collapse displacement belongs to .rota-expand.
    const orderChanged =
      lastOrder.current !== null && lastOrder.current !== orderKey
    lastOrder.current = orderKey
    const nextTops = new Map<string, number>()
    for (const [id, el] of nodes.current) nextTops.set(id, el.offsetTop)
    if (!reduceMotion && orderChanged) {
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
            { duration: FLIP_MS, easing: getFlipEasing() },
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
  badgeDelayMs,
  verdict,
  expanded,
  onToggle,
  whyLine,
}: {
  ref: (el: HTMLDivElement | null) => void
  option: FlightOption
  travelers: number
  isBest: boolean
  enterDelayMs: number
  badgeDelayMs: number
  verdict: boolean
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
      style={
        {
          animationDelay: `${enterDelayMs}ms`,
          '--rota-verdict-delay': `${badgeDelayMs}ms`,
        } as CSSProperties
      }
      className={`rota-row relative transition-colors ${
        isBest
          ? 'rota-best mb-1.5'
          : 'border-b border-white/5 hover:bg-white/[0.03]'
      } ${verdict ? 'rota-verdict' : ''}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-5 py-3 pr-2 pl-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <span>
          <span className="block text-[15px] font-medium text-neutral-100 tabular-nums">
            {departTime(option)} → {arriveTime(option)}
            {dayOffset > 0 && (
              <sup className="text-[9px] text-muted-foreground">+{dayOffset}</sup>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {airlineLabel(option)}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-xs text-neutral-300">
            {formatDuration(option.totalDurationMinutes)}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
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
              style={{ animationDelay: `${badgeDelayMs}ms` }}
              className="rota-badge inline-block rounded bg-cyan-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300"
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
              <p className="rota-fade-in mt-2 max-w-lg leading-relaxed text-neutral-400">
                {whyLine}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
