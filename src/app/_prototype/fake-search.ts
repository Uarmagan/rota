// PROTOTYPE — scripted fake search driver shared by the three UI variants.
// Throwaway: canned data, canned timing, no network. Do not build on this.

import { useEffect, useRef, useState } from 'react'

export type Source = 'meridian' | 'aurora' | 'zephyr' | 'vantage'
export const SOURCES: readonly Source[] = ['meridian', 'aurora', 'zephyr', 'vantage']
export const PROGRAMS: Record<Source, string> = {
  meridian: 'Meridian Skyward',
  aurora: 'Aurora Award',
  zephyr: 'Zephyr Horizons',
  vantage: 'Vantage Peak',
}

export type ChipState = 'set' | 'changed' | 'unchanged'

export interface FakeChip {
  key: string
  label: string
  value: string
  prose: string
  state: ChipState
  assumed?: boolean
  defaulted?: boolean
}

export interface FakeOption {
  id: string
  source: Source
  depart: string
  arrive: string
  nextDay: boolean
  duration: string
  stops: number
  via: string | null
  miles: number
  fees: number
  cabin: string
}

export interface FakeBatch {
  atMs: number
  source: Source
  options: readonly FakeOption[]
  bestId: string
}

interface Step {
  utterance: string
  chips: readonly FakeChip[]
  batches: readonly FakeBatch[]
  whyLine: string
}

const PARSE_MS = 750

const STEPS: readonly Step[] = [
  {
    utterance: 'tokyo in feb for 2',
    chips: [
      { key: 'travelers', label: 'Travelers', value: '2', prose: '2 travelers', state: 'set' },
      { key: 'origin', label: 'From', value: 'ORD · Chicago', prose: 'from Chicago', state: 'set', assumed: true },
      { key: 'destination', label: 'To', value: 'NRT · Tokyo', prose: 'to Tokyo', state: 'set' },
      { key: 'dates', label: 'Dates', value: 'Feb 2027 · flexible', prose: 'sometime in February', state: 'set' },
      { key: 'cabin', label: 'Cabin', value: 'economy', prose: 'in economy', state: 'set', defaulted: true },
    ],
    batches: [
      {
        atMs: 350,
        source: 'meridian',
        bestId: 'e-m1',
        options: [
          { id: 'e-m1', source: 'meridian', depart: '11:05', arrive: '14:35', nextDay: true, duration: '12h 30m', stops: 0, via: null, miles: 72_500, fees: 56, cabin: 'economy' },
          { id: 'e-m2', source: 'meridian', depart: '08:20', arrive: '15:25', nextDay: true, duration: '16h 05m', stops: 1, via: 'SFO', miles: 61_000, fees: 42, cabin: 'economy' },
        ],
      },
      {
        atMs: 950,
        source: 'aurora',
        bestId: 'e-m1',
        options: [
          { id: 'e-a1', source: 'aurora', depart: '10:45', arrive: '17:05', nextDay: true, duration: '15h 20m', stops: 1, via: 'JFK', miles: 58_500, fees: 64, cabin: 'economy' },
        ],
      },
      {
        atMs: 1600,
        source: 'zephyr',
        bestId: 'e-z1',
        options: [
          { id: 'e-z1', source: 'zephyr', depart: '12:40', arrive: '14:45', nextDay: true, duration: '13h 05m', stops: 0, via: null, miles: 70_000, fees: 48, cabin: 'economy' },
          { id: 'e-z2', source: 'zephyr', depart: '06:55', arrive: '11:35', nextDay: true, duration: '19h 40m', stops: 2, via: null, miles: 52_000, fees: 38, cabin: 'economy' },
        ],
      },
      {
        atMs: 2250,
        source: 'vantage',
        bestId: 'e-z1',
        options: [
          { id: 'e-v1', source: 'vantage', depart: '17:30', arrive: '22:25', nextDay: true, duration: '14h 55m', stops: 1, via: 'SFO', miles: 66_500, fees: 71, cabin: 'economy' },
        ],
      },
    ],
    whyLine: 'Nonstop, and 6h 35m faster than the cheapest option here for 18,000 more miles.',
  },
  {
    utterance: 'actually business class, nonstop if possible',
    chips: [
      { key: 'travelers', label: 'Travelers', value: '2', prose: '2 travelers', state: 'unchanged' },
      { key: 'origin', label: 'From', value: 'ORD · Chicago', prose: 'from Chicago', state: 'unchanged', assumed: true },
      { key: 'destination', label: 'To', value: 'NRT · Tokyo', prose: 'to Tokyo', state: 'unchanged' },
      { key: 'dates', label: 'Dates', value: 'Feb 2027 · flexible', prose: 'sometime in February', state: 'unchanged' },
      { key: 'cabin', label: 'Cabin', value: 'business', prose: 'in business', state: 'changed' },
      { key: 'nonstop', label: 'Nonstop', value: 'preferred', prose: 'nonstop if possible', state: 'set' },
    ],
    batches: [
      {
        atMs: 300,
        source: 'meridian',
        bestId: 'b-m1',
        options: [
          { id: 'b-m1', source: 'meridian', depart: '11:05', arrive: '14:35', nextDay: true, duration: '12h 30m', stops: 0, via: null, miles: 145_000, fees: 96, cabin: 'business' },
        ],
      },
      {
        atMs: 1000,
        source: 'aurora',
        bestId: 'b-m1',
        options: [
          { id: 'b-a1', source: 'aurora', depart: '09:15', arrive: '16:25', nextDay: true, duration: '16h 10m', stops: 1, via: 'JFK', miles: 128_000, fees: 88, cabin: 'business' },
        ],
      },
      {
        atMs: 1500,
        source: 'zephyr',
        bestId: 'b-m1',
        options: [
          { id: 'b-z1', source: 'zephyr', depart: '12:40', arrive: '14:45', nextDay: true, duration: '13h 05m', stops: 0, via: null, miles: 150_000, fees: 102, cabin: 'business' },
        ],
      },
      { atMs: 2100, source: 'vantage', bestId: 'b-m1', options: [] },
    ],
    whyLine: 'Nonstop and the fastest of the current results — 17,000 more miles than the cheapest, but 3h 40m faster.',
  },
]

export type Phase = 'idle' | 'parsing' | 'streaming' | 'done'

export interface FakeSearch {
  phase: Phase
  runId: number
  chips: readonly FakeChip[]
  batches: readonly FakeBatch[]
  bestId: string | null
  whyLine: string | null
  suggestion: string
  sourceStatus(source: Source): 'idle' | 'searching' | 'done'
  submit(): void
}

interface RunState {
  phase: Phase
  step: number
  runId: number
  chips: readonly FakeChip[]
  batches: readonly FakeBatch[]
  bestId: string | null
  showWhy: boolean
}

const IDLE: RunState = {
  phase: 'idle',
  step: -1,
  runId: 0,
  chips: [],
  batches: [],
  bestId: null,
  showWhy: false,
}

export function useFakeSearch(): FakeSearch {
  const [state, setState] = useState<RunState>(IDLE)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const submit = () => {
    if (state.phase === 'parsing' || state.phase === 'streaming') return
    const stepIndex = state.phase === 'done' ? (state.step + 1) % STEPS.length : 0
    const step = STEPS[stepIndex]
    const runId = state.runId + 1
    timers.current.forEach(clearTimeout)
    timers.current = []
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms))

    setState((s) => ({ ...s, phase: 'parsing', runId }))
    at(PARSE_MS, () =>
      setState({
        phase: 'streaming',
        step: stepIndex,
        runId,
        chips: step.chips,
        batches: [],
        bestId: null,
        showWhy: false,
      }),
    )
    for (const batch of step.batches) {
      at(PARSE_MS + batch.atMs, () =>
        setState((s) => ({ ...s, batches: [...s.batches, batch], bestId: batch.bestId })),
      )
    }
    const lastAt = Math.max(...step.batches.map((b) => b.atMs))
    at(PARSE_MS + lastAt + 450, () => setState((s) => ({ ...s, phase: 'done', showWhy: true })))
  }

  return {
    phase: state.phase,
    runId: state.runId,
    chips: state.chips,
    batches: state.batches,
    bestId: state.bestId,
    whyLine: state.showWhy && state.step >= 0 ? STEPS[state.step].whyLine : null,
    suggestion:
      state.phase === 'idle'
        ? STEPS[0].utterance
        : state.phase === 'done'
          ? STEPS[(state.step + 1) % STEPS.length].utterance
          : '',
    sourceStatus: (source) =>
      state.batches.some((b) => b.source === source)
        ? 'done'
        : state.phase === 'streaming'
          ? 'searching'
          : 'idle',
    submit,
  }
}

export function fmtMiles(n: number): string {
  return n.toLocaleString('en-US')
}

export function allOptions(batches: readonly FakeBatch[]): FakeOption[] {
  return batches.flatMap((b) => [...b.options])
}
