'use client'

import { useState } from 'react'
import { SUPPORTED_PLACES } from '../../lib/schema/places'
import type { IntentField } from '../../lib/schema/intent-diff'
import type { Place } from '../../lib/schema/trip-intent'
import type { ChipView } from './format'

export type ChipAnimation = 'set' | 'changed'

const CHIP_BASE =
  'inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs'

export function ChipsRow({
  chips,
  animations,
  runId,
  onPickOrigin,
}: {
  chips: readonly ChipView[]
  animations: ReadonlyMap<IntentField, ChipAnimation>
  runId: number
  onPickOrigin: (place: Place) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-3 pt-3 pb-2.5">
      {chips.map((chip) =>
        chip.field === 'origin' ? (
          <OriginChip
            key={`origin:${runId}`}
            chip={chip}
            animation={animations.get('origin')}
            onPick={onPickOrigin}
          />
        ) : (
          <span
            key={`${chip.field}:${runId}`}
            className={chipClasses(chip, animations.get(chip.field))}
          >
            <ChipBody chip={chip} />
          </span>
        ),
      )}
    </div>
  )
}

export function PromptChip({ label }: { label: string }) {
  return (
    <span
      className={`${CHIP_BASE} rota-pop animate-pulse border-dashed border-indigo-300/40 bg-indigo-300/[0.04] text-indigo-200/90`}
    >
      {label}
    </span>
  )
}

function chipClasses(chip: ChipView, animation: ChipAnimation | undefined): string {
  return [
    CHIP_BASE,
    chip.assumed
      ? 'border-dashed border-amber-400/40 bg-amber-400/[0.06]'
      : 'border-white/10 bg-white/[0.06]',
    animation === 'set' ? 'rota-pop' : '',
    animation === 'changed' ? 'rota-flash' : '',
  ].join(' ')
}

function ChipBody({ chip }: { chip: ChipView }) {
  return (
    <>
      <span className="text-[10px] tracking-wide text-neutral-500 uppercase">
        {chip.label}
      </span>
      <span className="font-medium text-neutral-100">{chip.value}</span>
      {chip.assumed && <span className="text-[10px] text-amber-400/90">assumed</span>}
    </>
  )
}

// The one-tap origin editor: picking a city replaces the origin directly
// (assumed flips off), no parser involved. Picking the current city is a
// confirmation — same flip.
function OriginChip({
  chip,
  animation,
  onPick,
}: {
  chip: ChipView
  animation: ChipAnimation | undefined
  onPick: (place: Place) => void
}) {
  const [open, setOpen] = useState(false)
  const currentIata = chip.value.slice(0, 3)

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${chipClasses(chip, animation)} cursor-pointer transition-colors hover:border-white/25`}
      >
        <ChipBody chip={chip} />
        <span className="text-[9px] text-neutral-500">▾</span>
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-20 mt-1.5 w-52 rounded-lg border border-white/10 bg-[#17171f] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
            <p className="px-3 pt-1.5 pb-1 text-[10px] tracking-wide text-neutral-500 uppercase">
              Flying from
            </p>
            {SUPPORTED_PLACES.map((place) => (
              <button
                key={place.iata}
                type="button"
                onClick={() => {
                  onPick({ iata: place.iata, city: place.city })
                  setOpen(false)
                }}
                className="flex w-full items-baseline justify-between px-3 py-1.5 text-left text-xs hover:bg-white/[0.06]"
              >
                <span className="text-neutral-100">
                  {place.city}{' '}
                  <span className="text-neutral-500">{place.iata}</span>
                </span>
                {place.iata === currentIata && (
                  <span className="text-indigo-300">
                    {chip.assumed ? 'confirm' : '✓'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}
