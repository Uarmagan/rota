'use client'

// PROTOTYPE variant C — "Ledger": split cockpit. Intent as a field ledger in a
// left rail, results as per-source columns on the right. Throwaway.

import { useState } from 'react'
import {
  allOptions,
  fmtMiles,
  PROGRAMS,
  SOURCES,
  type FakeOption,
  type FakeSearch,
} from './fake-search'

export function VariantC({ search }: { search: FakeSearch }) {
  const [text, setText] = useState('')
  const hasRun = search.chips.length > 0
  const optionCount = allOptions(search.batches).length

  return (
    <div
      className="flex min-h-screen bg-neutral-100 text-neutral-900 antialiased"
      style={
        {
          '--proto-accent': '#34d39966',
          '--proto-skeleton': '#e7e7e7',
          '--proto-skeleton-hi': '#f2f2f2',
        } as React.CSSProperties
      }
    >
      <aside className="flex w-[310px] shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 p-4">
          <p className="mb-3 text-[10px] font-bold tracking-[0.3em] text-neutral-400 uppercase">
            Rota <span className="font-normal text-neutral-300">/ console</span>
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              search.submit()
              setText('')
            }}
          >
            <textarea
              autoFocus
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  search.submit()
                  setText('')
                }
              }}
              placeholder={
                search.suggestion ? `> ${search.suggestion}` : '> describe the trip'
              }
              className="w-full resize-none rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-[13px] placeholder-neutral-400 outline-none focus:border-emerald-500"
            />
          </form>
          <p className="mt-1.5 h-4 font-mono text-[10px] text-neutral-400">
            {search.phase === 'parsing'
              ? 'parsing utterance…'
              : search.phase === 'streaming'
                ? 'searching 4 sources…'
                : search.phase === 'done'
                  ? `${optionCount} options · ${search.batches.length} sources`
                  : 'ready'}
          </p>
        </div>

        <div className="flex-1 p-4">
          <p className="mb-2 text-[10px] font-bold tracking-[0.3em] text-neutral-400 uppercase">
            Trip state
          </p>
          {!hasRun ? (
            <p className="pt-2 text-sm text-neutral-400">
              Nothing parsed yet — every field below will come from your words,
              and stays editable.
            </p>
          ) : (
            <dl>
              {search.chips.map((chip) => (
                <div
                  key={`${chip.key}-${search.runId}`}
                  className={`flex items-baseline justify-between border-b border-neutral-100 py-2.5 ${
                    chip.state === 'set' ? 'proto-pop' : ''
                  } ${chip.state === 'changed' ? 'proto-flash rounded' : ''}`}
                >
                  <dt className="text-[10px] font-semibold tracking-[0.15em] text-neutral-400 uppercase">
                    {chip.label}
                  </dt>
                  <dd className="flex items-baseline gap-2 text-sm font-medium">
                    {chip.value}
                    {chip.assumed && (
                      <span className="rounded-sm bg-amber-100 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-amber-800 uppercase">
                        assumed
                      </span>
                    )}
                    {chip.defaulted && (
                      <span className="text-[9px] tracking-wide text-neutral-300 uppercase">
                        default
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto p-5 pb-32">
        {!hasRun ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            Results land here, grouped by source, as each one answers.
          </div>
        ) : (
          <div className="grid min-w-[900px] grid-cols-4 gap-4">
            {SOURCES.map((source) => {
              const batch = search.batches.find((b) => b.source === source)
              const status = search.sourceStatus(source)
              return (
                <section key={source}>
                  <header className="mb-2 flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        status === 'done'
                          ? 'bg-emerald-500'
                          : status === 'searching'
                            ? 'animate-pulse bg-amber-400'
                            : 'bg-neutral-300'
                      }`}
                    />
                    <h2 className="text-[11px] font-bold tracking-[0.2em] text-neutral-500 uppercase">
                      {source}
                    </h2>
                    <span className="ml-auto font-mono text-[10px] text-neutral-400">
                      {batch ? `${batch.options.length}` : '—'}
                    </span>
                  </header>
                  <div className="space-y-2.5">
                    {status === 'searching' && (
                      <>
                        <div className="proto-shimmer h-[88px] rounded-lg" />
                        <div className="proto-shimmer h-[88px] rounded-lg" />
                      </>
                    )}
                    {batch && batch.options.length === 0 && (
                      <p className="rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-neutral-400">
                        No business-class inventory.
                      </p>
                    )}
                    {batch?.options.map((option) => (
                      <Card
                        key={option.id}
                        option={option}
                        isBest={search.bestId === option.id}
                        whyLine={search.bestId === option.id ? search.whyLine : null}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function Card({
  option,
  isBest,
  whyLine,
}: {
  option: FakeOption
  isBest: boolean
  whyLine: string | null
}) {
  return (
    <article
      className={`proto-row rounded-lg border bg-white p-3 shadow-sm ${
        isBest ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-neutral-200'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold tabular-nums">
          {option.depart}–{option.arrive}
          {option.nextDay && <sup className="font-normal text-neutral-400">+1</sup>}
        </span>
        {isBest && (
          <span
            key={option.id}
            className="proto-badge rounded-sm bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase"
          >
            Best
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-neutral-500">
        {option.duration} ·{' '}
        {option.stops === 0
          ? 'nonstop'
          : option.via
            ? `1 stop ${option.via}`
            : `${option.stops} stops`}
      </p>
      <p className="mt-2 border-t border-neutral-100 pt-2 text-[13px] font-medium tabular-nums">
        {fmtMiles(option.miles)} <span className="text-[10px] font-normal text-neutral-400">mi</span>
        <span className="text-neutral-500"> + ${option.fees}</span>
      </p>
      <p className="text-[9px] tracking-wide text-neutral-300 uppercase">
        {PROGRAMS[option.source]}
      </p>
      {whyLine && (
        <p className="proto-row mt-2 rounded-md bg-emerald-50 p-2 text-[11px] leading-relaxed text-emerald-900">
          {whyLine}
        </p>
      )}
    </article>
  )
}
