'use client'

// PROTOTYPE variant A — "Palette": dark command-bar. The typed utterance turns
// into chips inside the same panel and the input clears (the combined
// input/follow-up idea). Throwaway.

import { useState } from 'react'
import {
  fmtMiles,
  PROGRAMS,
  SOURCES,
  type FakeOption,
  type FakeSearch,
} from './fake-search'

const ACCENT = '#818cf8'

export function VariantA({ search }: { search: FakeSearch }) {
  const [text, setText] = useState('')
  const hasRun = search.chips.length > 0

  return (
    <div
      className="min-h-screen bg-[#0b0b0f] text-neutral-200 antialiased"
      style={
        {
          '--proto-accent': ACCENT,
          '--proto-skeleton': 'rgba(255,255,255,0.05)',
          '--proto-skeleton-hi': 'rgba(255,255,255,0.11)',
        } as React.CSSProperties
      }
    >
      <div
        className={`mx-auto flex w-full max-w-2xl flex-col px-6 ${
          hasRun ? 'pt-14' : 'min-h-screen justify-center pb-40'
        }`}
      >
        {!hasRun && (
          <p className="mb-6 text-center text-sm tracking-[0.35em] text-neutral-600 uppercase">
            Rota
          </p>
        )}

        <div className="rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          {hasRun && (
            <div
              key={search.runId}
              className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-3 pt-3 pb-2.5"
            >
              {search.chips.map((chip) => (
                <span
                  key={`${chip.key}-${search.runId}`}
                  className={`inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs ${
                    chip.assumed
                      ? 'border-dashed border-amber-400/40 bg-amber-400/[0.06]'
                      : 'border-white/10 bg-white/[0.06]'
                  } ${chip.state === 'set' ? 'proto-pop' : ''} ${
                    chip.state === 'changed' ? 'proto-flash' : ''
                  }`}
                >
                  <span className="text-[10px] tracking-wide text-neutral-500 uppercase">
                    {chip.label}
                  </span>
                  <span className="font-medium text-neutral-100">{chip.value}</span>
                  {chip.assumed && (
                    <span className="text-[10px] text-amber-400/90">assumed</span>
                  )}
                </span>
              ))}
            </div>
          )}

          <form
            className="flex items-center gap-3 px-4"
            onSubmit={(e) => {
              e.preventDefault()
              search.submit()
              setText('')
            }}
          >
            <span className="text-lg text-indigo-300/80 select-none">›</span>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                search.suggestion
                  ? `try: ${search.suggestion}`
                  : 'describe your trip…'
              }
              className="w-full bg-transparent py-3.5 text-[15px] text-neutral-100 placeholder-neutral-600 outline-none"
            />
            {search.phase === 'parsing' && (
              <span className="text-xs text-neutral-500">parsing…</span>
            )}
          </form>

          {search.phase === 'parsing' && (
            <div className="proto-progress mx-4 mb-2 h-0.5 rounded-full bg-white/[0.06]" />
          )}
        </div>

        {hasRun && (
          <div className="mt-8 pb-32">
            {SOURCES.map((source) => {
              const batch = search.batches.find((b) => b.source === source)
              const status = search.sourceStatus(source)
              if (status === 'idle' && !batch) return null
              return (
                <section key={source} className="mb-7">
                  <header className="mb-1 flex items-baseline justify-between">
                    <h2 className="text-[10px] font-semibold tracking-[0.2em] text-neutral-500 uppercase">
                      {source}
                    </h2>
                    <span className="text-[10px] text-neutral-600">
                      {status === 'searching' ? 'searching…' : PROGRAMS[source]}
                    </span>
                  </header>
                  {status === 'searching' ? (
                    <div className="space-y-2 pt-1">
                      <div className="proto-shimmer h-10 rounded-md" />
                      <div className="proto-shimmer h-10 rounded-md" />
                    </div>
                  ) : batch && batch.options.length === 0 ? (
                    <p className="border-b border-white/5 py-3 text-sm text-neutral-600">
                      No business-class seats on this route.
                    </p>
                  ) : (
                    batch?.options.map((option) => (
                      <Row
                        key={option.id}
                        option={option}
                        isBest={search.bestId === option.id}
                        whyLine={
                          search.bestId === option.id ? search.whyLine : null
                        }
                      />
                    ))
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({
  option,
  isBest,
  whyLine,
}: {
  option: FakeOption
  isBest: boolean
  whyLine: string | null
}) {
  return (
    <div
      className={`proto-row border-b border-white/5 py-3 pl-3 transition-colors hover:bg-white/[0.03] ${
        isBest ? 'border-l-2 border-l-indigo-400 bg-indigo-400/[0.04]' : 'border-l-2 border-l-transparent'
      }`}
    >
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-6">
        <div>
          <span className="font-medium text-neutral-100 tabular-nums">
            {option.depart} → {option.arrive}
            {option.nextDay && <sup className="text-[9px] text-neutral-500">+1</sup>}
          </span>
          <span className="ml-3 text-xs text-neutral-500">
            {option.duration} ·{' '}
            {option.stops === 0
              ? 'nonstop'
              : option.stops === 1
                ? `1 stop${option.via ? ` · ${option.via}` : ''}`
                : `${option.stops} stops`}
          </span>
        </div>
        <span className="text-sm text-neutral-300 tabular-nums">
          {fmtMiles(option.miles)} <span className="text-neutral-500">mi</span> +{' '}
          <span className="text-neutral-400">${option.fees}</span>
        </span>
        <span className="w-14 text-right">
          {isBest && (
            <span
              key={option.id}
              className="proto-badge inline-block rounded bg-indigo-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300"
            >
              ★ BEST
            </span>
          )}
        </span>
      </div>
      {whyLine && (
        <p className="proto-row mt-1.5 max-w-lg text-xs leading-relaxed text-neutral-500">
          {whyLine}
        </p>
      )}
    </div>
  )
}
