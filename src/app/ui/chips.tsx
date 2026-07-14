'use client'

import { useEffect, useRef, useState } from 'react'
import type { IntentEdit } from '../../lib/engine/edit'
import { SUPPORTED_PLACES } from '../../lib/schema/places'
import type { IntentField } from '../../lib/schema/intent-diff'
import {
  CABINS,
  type DateWindow,
  type TripIntent,
} from '../../lib/schema/trip-intent'
import { chipsFromIntent, type ChipView } from './format'

export type ChipAnimation = 'set' | 'changed'

const CHIP_BASE =
  'inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs'
const PANEL =
  'rota-panel absolute top-full left-0 z-20 mt-1.5 min-w-52 rounded-lg border border-white/10 bg-[#17171f] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.6)]'
const OPTION =
  'flex w-full items-baseline justify-between rounded px-2 py-1.5 text-left text-xs text-neutral-100 hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none'

export function ChipsRow({
  intent,
  animations,
  runId,
  onEdit,
}: {
  intent: TripIntent
  animations: ReadonlyMap<IntentField, ChipAnimation>
  runId: number
  onEdit: (edit: IntentEdit) => void
}) {
  const [openField, setOpenField] = useState<IntentField | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const chips = chipsFromIntent(intent)

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenField(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenField(null)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const emit = (edit: IntentEdit) => {
    onEdit(edit)
    setOpenField(null)
  }

  return (
    <div
      ref={rootRef}
      className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-3 pt-3 pb-2.5"
    >
      {chips.map((chip) => {
        const panelId = `chip-editor-${chip.field.replaceAll('.', '-')}`
        const open = openField === chip.field
        return (
          <span key={`${chip.field}:${runId}`} className="relative">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpenField(open ? null : chip.field)}
              className={`${chipClasses(chip, animations.get(chip.field))} rota-press cursor-pointer transition-colors hover:border-white/25`}
            >
              <ChipBody chip={chip} />
              <span className="text-[9px] text-neutral-500">▾</span>
            </button>
            {open && (
              <div
                id={panelId}
                role="group"
                aria-label={`Edit ${chip.label}`}
                className={PANEL}
              >
                <EditorPanel field={chip.field} intent={intent} onEdit={emit} />
              </div>
            )}
          </span>
        )
      })}
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

function EditorPanel({
  field,
  intent,
  onEdit,
}: {
  field: IntentField
  intent: TripIntent
  onEdit: (edit: IntentEdit) => void
}) {
  switch (field) {
    case 'travelers':
      return (
        <label className="block text-[10px] tracking-wide text-neutral-500 uppercase">
          Travelers
          <select
            aria-label="Travelers"
            value={intent.travelers ?? 1}
            onChange={(event) =>
              onEdit({ field: 'travelers', value: Number(event.target.value) })
            }
            className="mt-1 block w-full rounded border border-white/10 bg-[#17171f] px-2 py-1.5 text-xs text-neutral-100"
          >
            {Array.from({ length: 9 }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
      )
    case 'origin':
      return (
        <PlaceOptions
          currentIata={intent.origin?.iata ?? null}
          assumed={intent.origin?.assumed ?? false}
          onPick={(value) => onEdit({ field: 'origin', value })}
        />
      )
    case 'destination':
      return (
        <>
          <PlaceOptions
            currentIata={intent.destination?.iata ?? null}
            assumed={false}
            onPick={(value) => onEdit({ field: 'destination', value })}
          />
          <ClearButton onClick={() => onEdit({ field: 'destination', value: null })} />
        </>
      )
    case 'cabin':
      return (
        <OptionList
          values={CABINS}
          current={intent.cabin}
          onPick={(value) => onEdit({ field: 'cabin', value })}
        />
      )
    case 'dates':
      return <DateEditor current={intent.dates} onEdit={onEdit} />
    case 'priority':
      return (
        <>
          <OptionList
            values={['cheapest', 'fastest']}
            current={intent.priority}
            onPick={(value) => onEdit({ field: 'priority', value })}
          />
          <ClearButton onClick={() => onEdit({ field: 'priority', value: null })} />
        </>
      )
    case 'constraints.nonstop':
      return (
        <>
          <OptionList
            values={['required', 'preferred']}
            current={intent.constraints.nonstop}
            onPick={(value) => onEdit({ field: 'constraints.nonstop', value })}
          />
          <ClearButton
            onClick={() => onEdit({ field: 'constraints.nonstop', value: null })}
          />
        </>
      )
    case 'constraints.arriveBy':
      return (
        <TimeEditor
          label="Arrive by"
          initial={intent.constraints.arriveBy}
          onApply={(value) => onEdit({ field: 'constraints.arriveBy', value })}
          onClear={() => onEdit({ field: 'constraints.arriveBy', value: null })}
        />
      )
    case 'constraints.departAfter':
      return (
        <TimeEditor
          label="Depart after"
          initial={intent.constraints.departAfter}
          onApply={(value) => onEdit({ field: 'constraints.departAfter', value })}
          onClear={() => onEdit({ field: 'constraints.departAfter', value: null })}
        />
      )
    case 'constraints.avoidRedeye':
      return (
        <>
          <BooleanOptions
            current={intent.constraints.avoidRedeye}
            onPick={(value) => onEdit({ field: 'constraints.avoidRedeye', value })}
          />
          <ClearButton
            onClick={() => onEdit({ field: 'constraints.avoidRedeye', value: null })}
          />
        </>
      )
    case 'constraints.avoidLateArrival':
      return (
        <>
          <BooleanOptions
            current={intent.constraints.avoidLateArrival}
            onPick={(value) =>
              onEdit({ field: 'constraints.avoidLateArrival', value })
            }
          />
          <ClearButton
            onClick={() =>
              onEdit({ field: 'constraints.avoidLateArrival', value: null })
            }
          />
        </>
      )
  }
}

function PlaceOptions({
  currentIata,
  assumed,
  onPick,
}: {
  currentIata: string | null
  assumed: boolean
  onPick: (place: { iata: string; city: string }) => void
}) {
  return SUPPORTED_PLACES.map((place) => (
    <button
      key={place.iata}
      type="button"
      onClick={() => onPick(place)}
      className={OPTION}
    >
      <span>
        {place.city} <span className="text-neutral-500">{place.iata}</span>
      </span>
      {place.iata === currentIata && (
        <span className="text-indigo-300">{assumed ? 'confirm' : '✓'}</span>
      )}
    </button>
  ))
}

function OptionList<T extends string>({
  values,
  current,
  onPick,
}: {
  values: readonly T[]
  current: T | null
  onPick: (value: T) => void
}) {
  return values.map((value) => (
    <button key={value} type="button" onClick={() => onPick(value)} className={OPTION}>
      <span>{value.replace('_', ' ')}</span>
      {value === current && <span className="text-indigo-300">✓</span>}
    </button>
  ))
}

function BooleanOptions({
  current,
  onPick,
}: {
  current: boolean | null
  onPick: (value: boolean) => void
}) {
  return (
    <>
      <button type="button" onClick={() => onPick(true)} className={OPTION}>
        <span>avoid</span>
        {current === true && <span className="text-indigo-300">✓</span>}
      </button>
      <button type="button" onClick={() => onPick(false)} className={OPTION}>
        <span>fine</span>
        {current === false && <span className="text-indigo-300">✓</span>}
      </button>
    </>
  )
}

function DateEditor({
  current,
  onEdit,
}: {
  current: DateWindow | null
  onEdit: (edit: IntentEdit) => void
}) {
  const [flexibility, setFlexibility] = useState<'exact' | 'flexible'>(
    current?.flexibility ?? 'exact',
  )
  const [earliest, setEarliest] = useState(current?.earliest ?? '')
  const [latest, setLatest] = useState(current?.latest ?? '')
  const valid =
    earliest !== '' &&
    (flexibility === 'exact' || (latest !== '' && earliest <= latest))

  const apply = () => {
    if (!valid) return
    onEdit({
      field: 'dates',
      value: {
        earliest,
        latest: flexibility === 'exact' ? earliest : latest,
        flexibility,
      },
    })
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex gap-3">
        <label>
          <input
            type="radio"
            name="date-flexibility"
            checked={flexibility === 'exact'}
            onChange={() => setFlexibility('exact')}
          />{' '}
          Exact
        </label>
        <label>
          <input
            type="radio"
            name="date-flexibility"
            checked={flexibility === 'flexible'}
            onChange={() => setFlexibility('flexible')}
          />{' '}
          Flexible
        </label>
      </div>
      {flexibility === 'exact' ? (
        <DateInput label="Date" value={earliest} onChange={setEarliest} />
      ) : (
        <>
          <DateInput label="Earliest" value={earliest} onChange={setEarliest} />
          <DateInput label="Latest" value={latest} onChange={setLatest} />
        </>
      )}
      <div className="flex justify-between gap-2">
        <ClearButton onClick={() => onEdit({ field: 'dates', value: null })} />
        <button
          type="button"
          disabled={!valid}
          onClick={apply}
          className="rounded bg-indigo-400/20 px-2 py-1 text-indigo-200 disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-[10px] tracking-wide text-neutral-500 uppercase">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block rounded border border-white/10 bg-[#17171f] px-2 py-1 text-xs text-neutral-100"
      />
    </label>
  )
}

function TimeEditor({
  label,
  initial,
  onApply,
  onClear,
}: {
  label: string
  initial: string | null
  onApply: (value: string) => void
  onClear: () => void
}) {
  const [value, setValue] = useState(initial ?? '')
  return (
    <div className="space-y-2">
      <label className="block text-[10px] tracking-wide text-neutral-500 uppercase">
        {label}
        <input
          type="time"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-1 block rounded border border-white/10 bg-[#17171f] px-2 py-1 text-xs text-neutral-100"
        />
      </label>
      <div className="flex justify-between gap-2">
        <ClearButton onClick={onClear} />
        <button
          type="button"
          disabled={value === ''}
          onClick={() => onApply(value)}
          className="rounded bg-indigo-400/20 px-2 py-1 text-xs text-indigo-200 disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-300"
    >
      Clear
    </button>
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
