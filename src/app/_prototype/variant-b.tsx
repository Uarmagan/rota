'use client'

// PROTOTYPE variant B — "Editorial": light serif, the intent renders as an
// editable sentence, results as boarding-pass cards. Throwaway.

import { useState } from 'react'
import {
  allOptions,
  fmtMiles,
  PROGRAMS,
  SOURCES,
  type FakeOption,
  type FakeSearch,
} from './fake-search'

const ACCENT = '#b45309'

export function VariantB({ search }: { search: FakeSearch }) {
  const [text, setText] = useState('')
  const hasRun = search.chips.length > 0
  const best = allOptions(search.batches).find((o) => o.id === search.bestId)

  return (
    <div
      className="min-h-screen bg-[#faf7f2] font-serif text-stone-900 antialiased"
      style={
        {
          '--proto-accent': '#f59e0b66',
          '--proto-skeleton': '#efe9df',
          '--proto-skeleton-hi': '#f7f3ec',
        } as React.CSSProperties
      }
    >
      <div className="mx-auto max-w-4xl px-8 pb-40">
        <header className="flex items-center justify-between py-8">
          <span className="text-sm font-semibold tracking-[0.45em] uppercase">
            Rota
          </span>
          <span className="font-sans text-[10px] tracking-widest text-stone-400 uppercase">
            simulated availability
          </span>
        </header>

        {!hasRun ? (
          <div className="pt-28 text-center">
            <h1 className="text-6xl leading-tight tracking-tight">Where to?</h1>
            <p className="mt-4 font-sans text-sm text-stone-500">
              Say it like you&rsquo;d say it to a person.
            </p>
          </div>
        ) : (
          <h1
            key={search.runId}
            className="max-w-3xl pt-6 text-4xl leading-snug tracking-tight"
          >
            {search.chips.map((chip, i) => (
              <span key={`${chip.key}-${search.runId}`}>
                <span
                  className={`cursor-pointer underline decoration-dotted decoration-1 underline-offset-8 hover:decoration-solid ${
                    chip.assumed
                      ? 'decoration-amber-600 text-stone-600'
                      : chip.defaulted
                        ? 'decoration-stone-300 text-stone-500'
                        : 'decoration-stone-400'
                  } ${chip.state === 'set' ? 'proto-pop inline-block' : ''} ${
                    chip.state === 'changed' ? 'proto-flash rounded-sm' : ''
                  }`}
                  title={`${chip.label}: ${chip.value} — tap to edit`}
                >
                  {chip.prose}
                  {chip.assumed && <sup className="text-base text-amber-700">*</sup>}
                </span>
                {i < search.chips.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </h1>
        )}

        {hasRun && search.chips.some((c) => c.assumed) && (
          <p className="mt-4 font-sans text-xs text-stone-400">
            <span className="text-amber-700">*</span> assumed — we picked
            Chicago; tap to change it.
          </p>
        )}

        <form
          className={`${hasRun ? 'mt-8' : 'mx-auto mt-12 max-w-xl'}`}
          onSubmit={(e) => {
            e.preventDefault()
            search.submit()
            setText('')
          }}
        >
          <div className="flex items-baseline gap-3 border-b-2 border-stone-300 pb-2 focus-within:border-stone-900">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                search.suggestion
                  ? `“${search.suggestion}”`
                  : 'keep talking to refine the trip…'
              }
              className="w-full bg-transparent font-sans text-[15px] placeholder-stone-400 outline-none placeholder:italic"
            />
            <span className="font-sans text-xs whitespace-nowrap text-stone-400">
              {search.phase === 'parsing' ? 'reading…' : '↵ Enter'}
            </span>
          </div>
        </form>

        {hasRun && (
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {SOURCES.map((source) => {
              const batch = search.batches.find((b) => b.source === source)
              const status = search.sourceStatus(source)
              if (status === 'searching') {
                return (
                  <div
                    key={source}
                    className="proto-shimmer h-44 rounded-xl"
                  />
                )
              }
              if (!batch) return null
              if (batch.options.length === 0) {
                return (
                  <div
                    key={source}
                    className="proto-row flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 font-sans"
                  >
                    <span className="text-[10px] tracking-[0.25em] text-stone-400 uppercase">
                      {PROGRAMS[source]}
                    </span>
                    <span className="mt-2 text-sm text-stone-400">
                      No business seats this month
                    </span>
                  </div>
                )
              }
              return batch.options.map((option) => (
                <Pass
                  key={option.id}
                  option={option}
                  isBest={search.bestId === option.id}
                />
              ))
            })}
          </div>
        )}

        {hasRun && best && search.whyLine && (
          <p className="proto-row mx-auto mt-10 max-w-xl text-center text-lg leading-relaxed text-stone-600 italic">
            “{search.whyLine}”
          </p>
        )}
      </div>
    </div>
  )
}

function Pass({ option, isBest }: { option: FakeOption; isBest: boolean }) {
  return (
    <article
      className={`proto-row relative rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(28,25,23,0.08),0_8px_24px_rgba(28,25,23,0.06)] ${
        isBest ? 'ring-2 ring-amber-700/70' : ''
      }`}
    >
      {isBest && (
        <span
          key={option.id}
          className="proto-badge absolute -top-3 right-5 rotate-3 rounded-sm border-2 border-amber-700 bg-[#faf7f2] px-2 py-0.5 font-sans text-[10px] font-bold tracking-[0.2em] text-amber-800 uppercase"
        >
          Best match
        </span>
      )}
      <header className="flex items-baseline justify-between font-sans">
        <span className="text-[10px] tracking-[0.25em] text-stone-400 uppercase">
          {option.source}
        </span>
        <span className="text-[10px] text-stone-400">{PROGRAMS[option.source]}</span>
      </header>
      <div className="mt-4 flex items-end justify-between">
        <span className="text-3xl tracking-tight tabular-nums">{option.depart}</span>
        <div className="mx-3 mb-2 flex-1 border-b border-dashed border-stone-300 text-center">
          <span className="relative top-2 bg-white px-2 font-sans text-[10px] text-stone-400">
            {option.stops === 0
              ? 'nonstop'
              : option.via
                ? `via ${option.via}`
                : `${option.stops} stops`}
          </span>
        </div>
        <span className="text-3xl tracking-tight tabular-nums">
          {option.arrive}
          {option.nextDay && <sup className="text-sm text-stone-400">+1</sup>}
        </span>
      </div>
      <div className="mt-1 flex justify-between font-sans text-[11px] text-stone-400">
        <span>ORD · Chicago</span>
        <span>NRT · Tokyo</span>
      </div>
      <footer className="mt-5 flex items-baseline justify-between border-t border-dashed border-stone-200 pt-4">
        <span className="font-sans text-xs text-stone-500">
          {option.duration} · {option.cabin}
        </span>
        <span className="text-lg tabular-nums">
          {fmtMiles(option.miles)}{' '}
          <span className="font-sans text-xs text-stone-400">miles</span>
          <span className="font-sans text-sm text-stone-500"> + ${option.fees}</span>
        </span>
      </footer>
    </article>
  )
}
