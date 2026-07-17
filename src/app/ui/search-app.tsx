'use client'

// The M5 search surface: one input, chips as the source of truth, streamed
// results. Design folded in from the winning "Palette" prototype variant
// (branch prototype/search-ui-variants). The engine runs client-side per
// ARCHITECTURE.md: filter/rank/best-match/facts are computed here from raw
// streamed batches; the server only parses, streams, and phrases.

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Search as SearchIcon } from 'lucide-react'
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
import {
  DEMO_API_ERROR_CODES,
  isDemoApiErrorCode,
  type DemoApiErrorCode,
} from '../../lib/server/demo-api-errors'
import { useIsMobile } from '@/app/ui/hooks/use-mobile'
import { ChipsRow, type ChipAnimation, type ChipAnimationKind } from './chips'
import { clearIntent, loadIntent, saveIntent } from './intent-storage'
import { Results } from './results'
import { SearchStreamError, searchStream } from './stream'

type ParseOutcome =
  | { ok: true; intent: TripIntent; gap: GapOutcome }
  | { ok: false; error: AppError }

type AppError =
  | { kind: 'message'; message: string }
  | { kind: 'budget_exhausted' }

const DEMO_LIMIT_ERROR = {
  kind: 'message',
  message: 'Demo limit reached. Try again in a few minutes.',
} satisfies AppError

const BUDGET_EXHAUSTED_ERROR = {
  kind: 'budget_exhausted',
} satisfies AppError

const PARSER_UNAVAILABLE_ERROR = {
  kind: 'message',
  message: 'Trouble reaching the parser. Try again in a moment.',
} satisfies AppError

interface WhyLine {
  optionId: string
  text: string
}

const CHIP_STAGGER_MS = 85
const MAX_STAGGER_STEPS = 6 // cap so a many-field first parse never drags
const FIRST_WAVE_SETTLE_MS = 700 // opening cascade: 30ms × ~15 rows + 250ms entrance
const WAVE_SETTLE_MS = 600 // covers the FLIP glide and a crown handoff (280 + 300) + a beat

// jsdom has no matchMedia; treat that as reduced motion, like results.tsx does.
function motionOk(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
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
  const [error, setError] = useState<AppError | null>(null)
  const [text, setText] = useState('')
  const [sendOff, setSendOff] = useState<string | null>(null)
  const isMobile = useIsMobile()
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

  // Browser storage sync belongs in an effect to keep server rendering deterministic.
  useEffect(() => {
    const stored = loadIntent()
    if (stored === null) return
    const restoredGap = checkGaps(stored, null)
    setIntent(stored)
    setGap(restoredGap)
    if (restoredGap.kind !== 'follow_up' && stored.dates !== null) {
      void startSearch(stored, { skipWhy: true })
    }
  }, [])

  const applyIntent = (previous: TripIntent, next: TripIntent, nextGap: GapOutcome) => {
    saveIntent(next)
    const diff = computeIntentDiff(previous, next)
    setIntent(next)
    setGap(nextGap)
    const changed = diff.filter((change) => change.kind !== 'cleared')
    setAnimations(
      new Map(
        changed.map((change, index) => [
          change.field,
          {
            kind: change.kind as ChipAnimationKind,
            delayMs: Math.min(index, MAX_STAGGER_STEPS - 1) * CHIP_STAGGER_MS,
          },
        ]),
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
    if (motionOk()) setSendOff(utterance)
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
      setSendOff(null)
      setError(result.error)
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

  const startNewSearch = () => {
    invalidatePendingParse()
    searchRun.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    clearIntent()
    setIntent(null)
    setGap(null)
    setAnimations(new Map())
    setRunId(0)
    setStreaming(false)
    setBatches([])
    setWhy(null)
    setError(null)
    setText('')
    setSendOff(null)
  }

  const startSearch = async (
    searchIntent: TripIntent,
    options?: { skipWhy?: boolean },
  ) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const run = ++searchRun.current
    setBatches([])
    setWhy(null)
    setStreaming(true)

    const collected: SourceBatch[] = []
    const pending: SourceBatch[] = []
    let waveEndsAt = 0
    let firstWave = true
    const commitWave = () => {
      collected.push(...pending)
      pending.length = 0
      setBatches([...collected])
      waveEndsAt = Date.now() + (firstWave ? FIRST_WAVE_SETTLE_MS : WAVE_SETTLE_MS)
      firstWave = false
    }
    // Resolves once the playing wave has settled; false if this run went stale.
    const waveSettled = async () => {
      if (motionOk()) {
        const wait = waveEndsAt - Date.now()
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      }
      return searchRun.current === run && !controller.signal.aborted
    }
    try {
      const stream = searchStream(searchIntent, controller.signal)[Symbol.asyncIterator]()
      let nextBatch: Promise<IteratorResult<SourceBatch>> | null = null
      while (true) {
        nextBatch ??= stream.next()
        // While a wave is playing, race the stream against its settle time so
        // batches arriving mid-wave merge into the next wave.
        const { result } =
          pending.length > 0
            ? await Promise.race([
                nextBatch.then((r) => ({ result: r as IteratorResult<SourceBatch> | null })),
                new Promise<{ result: null }>((resolve) =>
                  setTimeout(
                    () => resolve({ result: null }),
                    Math.max(0, waveEndsAt - Date.now()),
                  ),
                ),
              ])
            : { result: await nextBatch }
        if (searchRun.current !== run || controller.signal.aborted) return
        if (result === null) {
          commitWave()
          continue
        }
        nextBatch = null
        if (result.done) break
        pending.push(result.value)
        if (!motionOk() || Date.now() >= waveEndsAt) commitWave()
      }
      if (pending.length > 0) {
        if (!(await waveSettled())) return
        commitWave()
      }
      // The settle beat (verdict bloom) waits for the last wave to finish.
      if (!(await waveSettled())) return
      setStreaming(false)
      if (!options?.skipWhy) {
        void fetchWhy(searchIntent, collected, run, controller.signal)
      }
    } catch (error) {
      if (controller.signal.aborted || searchRun.current !== run) return
      setStreaming(false)
      if (error instanceof SearchStreamError && error.status === 429) {
        setError(DEMO_LIMIT_ERROR)
        return
      }
      setError({
        kind: 'message',
        message: 'The search stream dropped. Try again.',
      })
    }
  }

  const fetchWhy = async (
    searchIntent: TripIntent,
    collected: readonly SourceBatch[],
    run: number,
    signal: AbortSignal,
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
        signal,
      })
      if (signal.aborted || searchRun.current !== run) return
      if (response.status === 429) {
        setError(DEMO_LIMIT_ERROR)
        return
      }
      if (response.status === 503) {
        const errorCode = await responseErrorCode(response)
        if (signal.aborted || searchRun.current !== run) return
        if (errorCode === DEMO_API_ERROR_CODES.budgetExhausted) {
          setError(BUDGET_EXHAUSTED_ERROR)
          return
        }
      }
      if (!response.ok) return
      const explanation = (await response.json()) as { text: string }
      if (signal.aborted || searchRun.current !== run) return
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
      <main
        className={`mx-auto flex w-full max-w-2xl flex-col px-4 sm:px-6 ${
          hasIntent ? 'pt-14 pb-32' : 'min-h-screen justify-center pb-40'
        }`}
      >
        {hasIntent && (
          <button
            type="button"
            onClick={startNewSearch}
            className="rota-press mb-4 inline-flex min-h-8 items-center gap-1.5 self-start rounded-md px-2 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            New search
          </button>
        )}
        <h1
          className={
            hasIntent
              ? 'sr-only'
              : 'mb-2 text-center text-sm font-normal tracking-[0.35em] text-neutral-400 uppercase'
          }
        >
          Rota
        </h1>
        {!hasIntent && (
          <p className="mb-6 text-center text-xs text-muted-foreground">
            Describe what you need in your own words.
          </p>
        )}

        <div className="rounded-xl border border-white/10 bg-white/[0.04] transition-colors focus-within:border-white/25">
          {intent !== null && (
            <ChipsRow
              intent={intent}
              animations={animations}
              runId={runId}
              onEdit={applyDirectEdit}
            />
          )}

          {/* The one echo surface: the parser's unhandled clause, quoted back beside
              whichever state it landed in. When destination is also missing, this line
              acknowledges while the prompt chip in the row asks (ADR 0005). */}
          {gap !== null && gap.kind !== 'ready' && gap.unhandled !== null && (
            <p className="border-b border-white/[0.06] px-4 py-2 text-xs text-muted-foreground">
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
            <span className="relative min-w-0 flex-1">
              <input
                autoFocus
                aria-label="Describe your trip"
                enterKeyHint="search"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={
                  intent === null || intent.destination === null
                    ? isMobile
                      ? 'Where to? Try “Tokyo in February”'
                      : 'Where to? Try “Tokyo in February for two”'
                    : intent.dates === null
                      ? 'When works? Try “in February”'
                      : isMobile
                        ? 'Anything else? Try “nonstop only”'
                        : 'Anything else? Try “business class, nonstop if possible”'
                }
                className="w-full bg-transparent py-3.5 text-base text-neutral-100 placeholder-muted-foreground outline-none md:text-[15px]"
              />
              {sendOff !== null && (
                <span
                  aria-hidden
                  onAnimationEnd={() => setSendOff(null)}
                  className="rota-send-off pointer-events-none absolute inset-0 flex items-center truncate text-base text-neutral-100 select-none md:text-[15px]"
                >
                  {sendOff}
                </span>
              )}
            </span>
            <button
              type="submit"
              aria-label="Search"
              disabled={text.trim() === '' || parsing}
              className={`flex size-8 shrink-0 items-center justify-center rounded-md transition-colors md:hidden ${
                text.trim() === '' || parsing
                  ? 'text-neutral-600'
                  : 'bg-primary text-primary-foreground active:bg-cyan-200'
              }`}
            >
              <SearchIcon aria-hidden="true" className="size-4" />
            </button>
          </form>

          {parsing && (
            <div
              role="status"
              aria-label="Reading your request"
              className="rota-progress mx-4 mb-2 h-0.5 rounded-full bg-white/[0.06]"
            />
          )}
        </div>

        {error !== null && (
          <p className="mt-3 px-1 text-xs text-rose-300/90" role="alert">
            {error.kind === 'budget_exhausted' ? (
              <>
                Live AI is paused because this month&rsquo;s demo budget has been
                used. Want to try natural-language search?{' '}
                <a
                  className="underline decoration-rose-300/40 underline-offset-2 hover:decoration-rose-200"
                  href="mailto:ugurarmagan93@gmail.com?subject=Rota%20demo%20budget"
                >
                  Email me
                </a>{' '}
                and I&rsquo;ll top it up.
              </>
            ) : (
              error.message
            )}
          </p>
        )}

        {showResults && filtered.length === 0 && options.length > 0 && !streaming && (
          <p className="mt-6 text-sm text-muted-foreground">
            All {options.length} options are hidden by your filters. Try
            relaxing one.
          </p>
        )}

        {showResults && (
          <Results
            options={ranked.map(({ option }) => option)}
            travelers={intent.travelers ?? 1}
            // The crown waits for the stream: mid-stream batches re-rank and
            // would bounce the badge between rows before the field is complete.
            bestId={streaming ? null : (best?.id ?? null)}
            why={why}
            streaming={streaming}
            sourcesDone={sourcesDone}
            sourcesTotal={SIMULATED_SOURCES.length}
            hidden={options.length - filtered.length}
          />
        )}
      </main>
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
    if (response.status === 429) {
      return { ok: false, error: DEMO_LIMIT_ERROR }
    }
    if (
      response.status === 503 &&
      (await responseErrorCode(response)) ===
        DEMO_API_ERROR_CODES.budgetExhausted
    ) {
      return { ok: false, error: BUDGET_EXHAUSTED_ERROR }
    }
    return {
      ok: false,
      error: {
        kind: 'message',
        message:
          response.status === 422
            ? 'I couldn’t turn that into a search. Mind rephrasing?'
            : PARSER_UNAVAILABLE_ERROR.message,
      },
    }
  } catch {
    if (signal.aborted) return null
    return { ok: false, error: PARSER_UNAVAILABLE_ERROR }
  }
}

async function responseErrorCode(
  response: Response,
): Promise<DemoApiErrorCode | null> {
  try {
    const body = (await response.json()) as { error?: unknown }
    return isDemoApiErrorCode(body.error) ? body.error : null
  } catch {
    return null
  }
}
