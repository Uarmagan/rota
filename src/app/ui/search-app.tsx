'use client'

// The M5 search surface: one input, chips as the source of truth, streamed
// results. Design folded in from the winning "Palette" prototype variant
// (branch prototype/search-ui-variants). The engine runs client-side per
// ARCHITECTURE.md: filter/rank/best-match/facts are computed here from raw
// streamed batches; the server only parses, streams, and phrases.

import { useEffect, useRef, useState } from 'react'
import './search.css'
import { SIMULATED_SOURCES } from '../../lib/availability/sources'
import type { SourceBatch } from '../../lib/availability/types'
import { computeIntentDiff } from '../../lib/engine/diff'
import { applyIntentEdit, type IntentEdit } from '../../lib/engine/edit'
import { explainOption } from '../../lib/engine/explain'
import { filterOptions } from '../../lib/engine/filter'
import { checkGaps, type GapOutcome } from '../../lib/engine/gaps'
import { bestMatch, rankOptions } from '../../lib/engine/rank'
import type { IntentField } from '../../lib/schema/intent-diff'
import {
  createEmptyTripIntent,
  type TripIntent,
} from '../../lib/schema/trip-intent'
import { ChipsRow, PromptChip, type ChipAnimation } from './chips'
import { Results } from './results'
import { searchStream } from './stream'

type ParseOutcome =
  | { ok: true; intent: TripIntent; gap: GapOutcome }
  | { ok: false; message: string }

interface WhyLine {
  optionId: string
  text: string
}

export function SearchApp() {
  const [intent, setIntent] = useState<TripIntent | null>(null)
  const [gap, setGap] = useState<GapOutcome | null>(null)
  const [animations, setAnimations] = useState<
    ReadonlyMap<IntentField, ChipAnimation>
  >(new Map())
  const [runId, setRunId] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [batches, setBatches] = useState<readonly SourceBatch[]>([])
  const [why, setWhy] = useState<WhyLine | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const parseAbortRef = useRef<AbortController | null>(null)
  const parseRun = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const searchRun = useRef(0)

  useEffect(
    () => () => {
      parseAbortRef.current?.abort()
      abortRef.current?.abort()
    },
    [],
  )

  const applyIntent = (previous: TripIntent, next: TripIntent, nextGap: GapOutcome) => {
    const diff = computeIntentDiff(previous, next)
    setIntent(next)
    setGap(nextGap)
    setAnimations(
      new Map(
        diff
          .filter((change) => change.kind !== 'cleared')
          .map((change) => [change.field, change.kind as ChipAnimation]),
      ),
    )
    setRunId((r) => r + 1)

    const searchable = nextGap.kind !== 'follow_up' && next.dates !== null
    if (!searchable) {
      abortRef.current?.abort()
      setStreaming(false)
      setBatches([])
      setWhy(null)
      return
    }
    // Identity re-emission (hostile input): empty diff, results left untouched.
    if (diff.length === 0 && batches.length > 0) return
    void startSearch(next)
  }

  const invalidatePendingParse = () => {
    parseRun.current += 1
    parseAbortRef.current?.abort()
    setParsing(false)
  }

  const submit = async () => {
    const utterance = text.trim()
    if (utterance === '' || parsing) return
    setText('') // the utterance becomes chips; a failed parse restores it
    setParsing(true)
    setError(null)
    const current = intent ?? createEmptyTripIntent()
    parseAbortRef.current?.abort()
    const controller = new AbortController()
    parseAbortRef.current = controller
    const run = ++parseRun.current
    const result = await requestParse(current, utterance, controller.signal)
    if (result === null || parseRun.current !== run || controller.signal.aborted) return
    setParsing(false)
    if (!result.ok) {
      setError(result.message)
      setText(utterance)
      return
    }
    applyIntent(current, result.intent, result.gap)
  }

  const applyDirectEdit = (edit: IntentEdit) => {
    if (intent === null) return
    invalidatePendingParse()
    const next = applyIntentEdit(intent, edit)
    applyIntent(intent, next, checkGaps(next, null))
  }

  const startSearch = async (searchIntent: TripIntent) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const run = ++searchRun.current
    setBatches([])
    setWhy(null)
    setStreaming(true)

    const collected: SourceBatch[] = []
    try {
      for await (const batch of searchStream(searchIntent, controller.signal)) {
        if (searchRun.current !== run) return
        collected.push(batch)
        setBatches([...collected])
      }
      if (searchRun.current !== run) return
      setStreaming(false)
      void fetchWhy(searchIntent, collected, run)
    } catch {
      if (controller.signal.aborted || searchRun.current !== run) return
      setStreaming(false)
      setError('The search stream dropped. Try again.')
    }
  }

  const fetchWhy = async (
    searchIntent: TripIntent,
    collected: readonly SourceBatch[],
    run: number,
  ) => {
    try {
      const filtered = filterOptions(
        searchIntent,
        collected.flatMap((batch) => batch.options),
      )
      const best = bestMatch(rankOptions(searchIntent, filtered))
      if (best === null) return
      const facts = explainOption(searchIntent, filtered, best.id)
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facts }),
      })
      if (!response.ok || searchRun.current !== run) return
      const explanation = (await response.json()) as { text: string }
      setWhy({ optionId: best.id, text: explanation.text })
    } catch {
      // The why-line is a flourish; a failed fetch just leaves it off.
    }
  }

  const hasIntent = intent !== null
  const searchable =
    intent !== null && intent.destination !== null && intent.dates !== null
  const options = batches.flatMap((batch) => batch.options)
  const filtered = searchable && options.length > 0 ? filterOptions(intent, options) : []
  const ranked = searchable ? rankOptions(intent, filtered) : []
  const best = bestMatch(ranked)
  const showResults = searchable && (streaming || batches.length > 0)
  const sourcesDone = new Set(
    batches.filter((batch) => batch.isFinal).map((batch) => batch.source),
  ).size

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-neutral-200 antialiased">
      <span className="fixed top-4 right-4 z-40 rounded-full border border-white/10 bg-[#0b0b0f]/80 px-2.5 py-1 text-[10px] tracking-[0.15em] text-neutral-500 uppercase select-none">
        simulated data
      </span>
      <div
        className={`mx-auto flex w-full max-w-2xl flex-col px-6 ${
          hasIntent ? 'pt-14 pb-32' : 'min-h-screen justify-center pb-40'
        }`}
      >
        {!hasIntent && (
          <>
            <p className="mb-2 text-center text-sm tracking-[0.35em] text-neutral-600 uppercase">
              Rota
            </p>
            <p className="mb-6 text-center text-xs text-neutral-600">
              Describe what you need in your own words.
            </p>
          </>
        )}

        <div className="rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          {intent !== null && (
            <ChipsRow
              intent={intent}
              animations={animations}
              runId={runId}
              onEdit={applyDirectEdit}
            />
          )}

          {intent !== null && (intent.destination === null || intent.dates === null) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
              {intent.destination === null && <PromptChip label="Where to?" />}
              {intent.destination !== null && intent.dates === null && (
                <PromptChip label="When?" />
              )}
              <span className="text-xs text-neutral-500">
                {gap?.kind === 'follow_up'
                  ? gap.question
                  : 'Add dates to search. Try “in february”.'}
              </span>
            </div>
          )}

          {gap?.kind === 'ready_with_notice' && (
            <p className="border-b border-white/[0.06] px-4 py-2 text-xs text-neutral-500">
              Couldn&rsquo;t use: &ldquo;{gap.unhandled}&rdquo;
            </p>
          )}

          <form
            className="flex items-center gap-3 px-4"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <span className="text-lg text-indigo-300/80 select-none">›</span>
            <input
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                hasIntent
                  ? 'refine: “actually business class, nonstop if possible”'
                  : 'describe your trip: “tokyo in feb for 2”'
              }
              className="w-full bg-transparent py-3.5 text-[15px] text-neutral-100 placeholder-neutral-600 outline-none"
            />
            {parsing && <span className="text-xs text-neutral-500">parsing…</span>}
          </form>

          {parsing && (
            <div className="rota-progress mx-4 mb-2 h-0.5 rounded-full bg-white/[0.06]" />
          )}
        </div>

        {error !== null && (
          <p className="mt-3 px-1 text-xs text-rose-300/90">{error}</p>
        )}

        {showResults && filtered.length === 0 && options.length > 0 && !streaming && (
          <p className="mt-6 text-sm text-neutral-500">
            All {options.length} options are hidden by your filters. Try
            relaxing one.
          </p>
        )}

        {showResults && (
          <Results
            options={ranked.map(({ option }) => option)}
            travelers={intent.travelers ?? 1}
            bestId={best?.id ?? null}
            why={why}
            streaming={streaming}
            sourcesDone={sourcesDone}
            sourcesTotal={SIMULATED_SOURCES.length}
            hidden={options.length - filtered.length}
          />
        )}
      </div>
    </div>
  )
}

async function requestParse(
  currentIntent: TripIntent,
  utterance: string,
  signal: AbortSignal,
): Promise<ParseOutcome | null> {
  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentIntent, utterance }),
      signal,
    })
    if (response.ok) {
      const body = (await response.json()) as { intent: TripIntent; gap: GapOutcome }
      return { ok: true, intent: body.intent, gap: body.gap }
    }
    return {
      ok: false,
      message:
        response.status === 422
          ? 'I couldn’t turn that into a search. Mind rephrasing?'
          : 'Trouble reaching the parser. Try again in a moment.',
    }
  } catch {
    if (signal.aborted) return null
    return {
      ok: false,
      message: 'Trouble reaching the parser. Try again in a moment.',
    }
  }
}
