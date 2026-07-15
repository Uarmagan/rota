'use client'

import { useState } from 'react'
import { CalendarDays, ChevronDown, Clock3, MapPin, Trash2 } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/app/ui/primitives/button'
import { Calendar } from '@/app/ui/primitives/calendar'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  useComboboxFilteredItems,
} from '@/app/ui/primitives/combobox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/ui/primitives/dropdown-menu'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/app/ui/primitives/drawer'
import { Popover, PopoverContent, PopoverTrigger } from '@/app/ui/primitives/popover'
import { ToggleGroup, ToggleGroupItem } from '@/app/ui/primitives/toggle-group'
import { Input } from '@/app/ui/primitives/input'
import { useIsMobile } from '@/app/ui/hooks/use-mobile'
import type { IntentEdit } from '../../lib/engine/edit'
import { SUPPORTED_PLACES } from '../../lib/schema/places'
import type { IntentField } from '../../lib/schema/intent-diff'
import {
  CABINS,
  type DateWindow,
  type Place,
  type TripIntent,
} from '../../lib/schema/trip-intent'
import { chipsFromIntent, type ChipView } from './format'

export type ChipAnimation = 'set' | 'changed'

const CHIP_BASE = 'inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs'
const CHIP_TRIGGER_INTERACTION =
  'rota-press cursor-pointer hover:border-white/25 focus-visible:border-indigo-300/70 focus-visible:ring-2 focus-visible:ring-indigo-300/30'

type SimpleField =
  | 'travelers'
  | 'cabin'
  | 'priority'
  | 'constraints.nonstop'
  | 'constraints.avoidRedeye'
  | 'constraints.avoidLateArrival'

type TimeField = 'constraints.arriveBy' | 'constraints.departAfter'

interface SimpleOption {
  value: string
  label: string
}

interface SimpleFieldDefinition {
  options: readonly SimpleOption[]
  currentValue: (intent: TripIntent) => string
  valueEdit: (value: string) => IntentEdit
  clearEdit: IntentEdit | null
}

const BOOLEAN_OPTIONS: readonly SimpleOption[] = [
  { value: 'true', label: 'Avoid' },
  { value: 'false', label: 'Fine' },
]

const SIMPLE_FIELD_DEFINITIONS: Record<SimpleField, SimpleFieldDefinition> = {
  travelers: {
    options: Array.from({ length: 9 }, (_, index) => ({
      value: String(index + 1),
      label: `${index + 1} ${index === 0 ? 'traveler' : 'travelers'}`,
    })),
    currentValue: (intent) => String(intent.travelers ?? 1),
    valueEdit: (value) => ({ field: 'travelers', value: Number(value) }),
    clearEdit: null,
  },
  cabin: {
    options: CABINS.map((value) => ({ value, label: value.replace('_', ' ') })),
    currentValue: (intent) => intent.cabin ?? 'economy',
    valueEdit: (value) => ({
      field: 'cabin',
      value: value as (typeof CABINS)[number],
    }),
    clearEdit: null,
  },
  priority: {
    options: [
      { value: 'cheapest', label: 'Cheapest first' },
      { value: 'fastest', label: 'Fastest first' },
    ],
    currentValue: (intent) => intent.priority ?? '',
    valueEdit: (value) => ({
      field: 'priority',
      value: value as 'cheapest' | 'fastest',
    }),
    clearEdit: { field: 'priority', value: null },
  },
  'constraints.nonstop': {
    options: [
      { value: 'required', label: 'Required' },
      { value: 'preferred', label: 'Preferred' },
    ],
    currentValue: (intent) => intent.constraints.nonstop ?? '',
    valueEdit: (value) => ({
      field: 'constraints.nonstop',
      value: value as 'required' | 'preferred',
    }),
    clearEdit: { field: 'constraints.nonstop', value: null },
  },
  'constraints.avoidRedeye': {
    options: BOOLEAN_OPTIONS,
    currentValue: (intent) =>
      intent.constraints.avoidRedeye === null ? '' : String(intent.constraints.avoidRedeye),
    valueEdit: (value) => ({
      field: 'constraints.avoidRedeye',
      value: value === 'true',
    }),
    clearEdit: { field: 'constraints.avoidRedeye', value: null },
  },
  'constraints.avoidLateArrival': {
    options: BOOLEAN_OPTIONS,
    currentValue: (intent) =>
      intent.constraints.avoidLateArrival === null
        ? ''
        : String(intent.constraints.avoidLateArrival),
    valueEdit: (value) => ({
      field: 'constraints.avoidLateArrival',
      value: value === 'true',
    }),
    clearEdit: { field: 'constraints.avoidLateArrival', value: null },
  },
}

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
  const chips = chipsFromIntent(intent)

  const emit = (edit: IntentEdit) => {
    onEdit(edit)
    setOpenField(null)
  }

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-3 pt-3 pb-2.5">
      {chips.map((chip) => {
        if (chip.field === 'origin' || chip.field === 'destination') {
          return (
            <AirportChip
              key={`${chip.field}:${runId}`}
              chip={chip}
              field={chip.field}
              intent={intent}
              open={openField === chip.field}
              animation={animations.get(chip.field)}
              onOpenChange={(open) => setOpenField(open ? chip.field : null)}
              onEdit={emit}
            />
          )
        }

        if (isSimpleField(chip.field)) {
          return (
            <SimpleChoiceChip
              key={`${chip.field}:${runId}`}
              chip={chip}
              field={chip.field}
              intent={intent}
              open={openField === chip.field}
              animation={animations.get(chip.field)}
              onOpenChange={(open) => setOpenField(open ? chip.field : null)}
              onEdit={emit}
            />
          )
        }

        if (chip.field === 'dates') {
          return (
            <DateChip
              key={`${chip.field}:${runId}`}
              chip={chip}
              current={intent.dates}
              open={openField === chip.field}
              animation={animations.get(chip.field)}
              onOpenChange={(open) => setOpenField(open ? chip.field : null)}
              onEdit={emit}
            />
          )
        }

        if (isTimeField(chip.field)) {
          return (
            <TimeChip
              key={`${chip.field}:${runId}`}
              chip={chip}
              field={chip.field}
              initial={timeValue(chip.field, intent)}
              open={openField === chip.field}
              animation={animations.get(chip.field)}
              onOpenChange={(open) => setOpenField(open ? chip.field : null)}
              onEdit={emit}
            />
          )
        }

        return null
      })}
    </div>
  )
}

function DateChip({
  chip,
  current,
  open,
  animation,
  onOpenChange,
  onEdit,
}: {
  chip: ChipView
  current: DateWindow | null
  open: boolean
  animation: ChipAnimation | undefined
  onOpenChange: (open: boolean) => void
  onEdit: (edit: IntentEdit) => void
}) {
  const isMobile = useIsMobile()
  const trigger = (
    <>
      <CalendarDays aria-hidden="true" className="size-3 text-neutral-500" />
      <ChipBody chip={chip} />
      <ChevronDown aria-hidden="true" className="size-3 text-neutral-500" />
    </>
  )
  const triggerClass = `${chipClasses(chip, animation)} ${CHIP_TRIGGER_INTERACTION}`

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerTrigger className={triggerClass}>{trigger}</DrawerTrigger>
        <DrawerContent aria-label="Edit Dates" className="dark border-white/10 bg-[#17171f]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Edit Dates</DrawerTitle>
            <DrawerDescription>Pick one day or a flexible travel window.</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pt-3 pb-5">
            <DateEditorContent current={current} onEdit={onEdit} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger className={triggerClass}>{trigger}</PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label="Edit Dates"
        align="start"
        sideOffset={6}
        className="dark w-auto gap-3 rounded-xl border border-white/10 bg-[#17171f] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.62)]"
      >
        <DateEditorContent current={current} onEdit={onEdit} />
      </PopoverContent>
    </Popover>
  )
}

function DateEditorContent({
  current,
  onEdit,
}: {
  current: DateWindow | null
  onEdit: (edit: IntentEdit) => void
}) {
  const [mode, setMode] = useState<'exact' | 'flexible'>(current?.flexibility ?? 'exact')
  const [range, setRange] = useState<DateRange | undefined>(() =>
    current === null
      ? undefined
      : {
          from: dateFromKey(current.earliest),
          to: dateFromKey(current.latest),
        },
  )
  const exactDate = current === null ? undefined : dateFromKey(current.earliest)
  const defaultMonth = range?.from ?? exactDate

  const changeMode = (values: readonly string[]) => {
    const next = values[0]
    if (next !== 'exact' && next !== 'flexible') return
    setMode(next)
    if (next === 'flexible') setRange(undefined)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-neutral-100">Travel dates</p>
          <p className="text-[11px] text-neutral-500">
            {mode === 'exact' ? 'Choose one departure day' : 'Choose a start and end'}
          </p>
        </div>
        <ToggleGroup
          value={[mode]}
          onValueChange={changeMode}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Date flexibility"
          className="border-white/10"
        >
          <ToggleGroupItem
            value="exact"
            aria-label="Exact"
            className="h-8 border-white/10 text-[11px] text-neutral-400 data-pressed:bg-indigo-300/15 data-pressed:text-indigo-200"
          >
            Exact
          </ToggleGroupItem>
          <ToggleGroupItem
            value="flexible"
            aria-label="Flexible"
            className="h-8 border-white/10 text-[11px] text-neutral-400 data-pressed:bg-indigo-300/15 data-pressed:text-indigo-200"
          >
            Flexible
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {mode === 'exact' ? (
        <Calendar
          mode="single"
          defaultMonth={defaultMonth}
          selected={exactDate}
          onDayClick={(date) => {
            const key = dateKey(date)
            onEdit({
              field: 'dates',
              value: { earliest: key, latest: key, flexibility: 'exact' },
            })
          }}
          className="mx-auto bg-transparent p-0 [--cell-size:--spacing(9)]"
        />
      ) : (
        <Calendar
          mode="range"
          min={1}
          defaultMonth={defaultMonth}
          selected={range}
          onSelect={(nextRange) => {
            setRange(nextRange)
            if (nextRange?.from === undefined || nextRange.to === undefined) return
            onEdit({
              field: 'dates',
              value: {
                earliest: dateKey(nextRange.from),
                latest: dateKey(nextRange.to),
                flexibility: 'flexible',
              },
            })
          }}
          className="mx-auto bg-transparent p-0 [--cell-size:--spacing(9)]"
        />
      )}

      <div className="flex items-center justify-between border-t border-white/[0.07] pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEdit({ field: 'dates', value: null })}
          className="text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200"
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
          Clear
        </Button>
        <span className="text-[10px] text-neutral-600">
          {mode === 'exact' ? 'Applies on selection' : 'Select both endpoints'}
        </span>
      </div>
    </div>
  )
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function dateKey(date: Date): string {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function TimeChip({
  chip,
  field,
  initial,
  open,
  animation,
  onOpenChange,
  onEdit,
}: {
  chip: ChipView
  field: TimeField
  initial: string | null
  open: boolean
  animation: ChipAnimation | undefined
  onOpenChange: (open: boolean) => void
  onEdit: (edit: IntentEdit) => void
}) {
  const isMobile = useIsMobile()
  const editorLabel = `Edit ${chip.label}`
  const trigger = (
    <>
      <Clock3 aria-hidden="true" className="size-3 text-neutral-500" />
      <ChipBody chip={chip} />
      <ChevronDown aria-hidden="true" className="size-3 text-neutral-500" />
    </>
  )
  const triggerClass = `${chipClasses(chip, animation)} ${CHIP_TRIGGER_INTERACTION}`
  const editor = (
    <TimeEditorContent
      key={open ? 'open' : 'closed'}
      label={chip.label}
      initial={initial}
      onApply={(value) => onEdit({ field, value })}
      onClear={() => onEdit({ field, value: null })}
    />
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerTrigger className={triggerClass}>{trigger}</DrawerTrigger>
        <DrawerContent aria-label={editorLabel} className="dark border-white/10 bg-[#17171f]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{editorLabel}</DrawerTitle>
            <DrawerDescription>Use local airport time.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pt-4 pb-6">{editor}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger className={triggerClass}>{trigger}</PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label={editorLabel}
        align="start"
        sideOffset={6}
        className="dark w-64 rounded-xl border border-white/10 bg-[#17171f] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.62)]"
      >
        {editor}
      </PopoverContent>
    </Popover>
  )
}

function TimeEditorContent({
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
    <div className="space-y-3">
      <label className="block space-y-1.5 text-[10px] tracking-[0.12em] text-neutral-500 uppercase">
        {label}
        <Input
          type="time"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-10 border-white/10 bg-white/[0.04] text-sm text-neutral-100 [color-scheme:dark] focus-visible:border-indigo-300/60 focus-visible:ring-indigo-300/20"
        />
      </label>
      <div className="flex items-center justify-between border-t border-white/[0.07] pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200"
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={value === ''}
          onClick={() => onApply(value)}
          className="bg-indigo-300 text-[#0b0b0f] hover:bg-indigo-200"
        >
          Apply
        </Button>
      </div>
    </div>
  )
}

function isTimeField(field: IntentField): field is TimeField {
  return field === 'constraints.arriveBy' || field === 'constraints.departAfter'
}

function timeValue(field: TimeField, intent: TripIntent): string | null {
  return field === 'constraints.arriveBy'
    ? intent.constraints.arriveBy
    : intent.constraints.departAfter
}

function AirportChip({
  chip,
  field,
  intent,
  open,
  animation,
  onOpenChange,
  onEdit,
}: {
  chip: ChipView
  field: 'origin' | 'destination'
  intent: TripIntent
  open: boolean
  animation: ChipAnimation | undefined
  onOpenChange: (open: boolean) => void
  onEdit: (edit: IntentEdit) => void
}) {
  const current = field === 'origin' ? intent.origin : intent.destination
  const assumed = field === 'origin' && intent.origin?.assumed === true
  const isMobile = useIsMobile()
  const triggerLabel = `${chip.label} ${chip.value}${chip.assumed ? ' assumed' : ''}`
  const triggerClass = `${chipClasses(chip, animation)} ${CHIP_TRIGGER_INTERACTION}`
  const selectPlace = (place: Place | null) => {
    if (place === null) return
    onEdit({
      field,
      value: { iata: place.iata, city: place.city },
    })
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerTrigger aria-label={triggerLabel} className={triggerClass}>
          <MapPin aria-hidden="true" className="size-3 text-neutral-500" />
          <ChipBody chip={chip} />
          <ChevronDown aria-hidden="true" className="size-3 text-neutral-500" />
        </DrawerTrigger>
        <DrawerContent
          aria-label={`Edit ${chip.label}`}
          className="dark border-white/10 bg-[#17171f]"
        >
          <DrawerHeader className="text-left">
            <DrawerTitle>{`Edit ${chip.label}`}</DrawerTitle>
            <DrawerDescription>Search by city or airport code.</DrawerDescription>
          </DrawerHeader>
          <Combobox
            inline
            items={SUPPORTED_PLACES}
            value={current}
            open={open}
            autoHighlight
            itemToStringLabel={(place) => `${place.city} ${place.iata}`}
            itemToStringValue={(place) => place.iata}
            isItemEqualToValue={(place, value) => place.iata === value.iata}
            onOpenChange={onOpenChange}
            onValueChange={selectPlace}
          >
            <div className="min-h-0 px-4 pt-3 pb-5">
              <ComboboxInput
                autoFocus
                showTrigger={false}
                aria-label="Search airports"
                placeholder="Search city or airport code"
                className="w-full **:data-[slot=input-group-control]:h-10 **:data-[slot=input-group-control]:text-sm"
              />
              <AirportOptions currentIata={current?.iata ?? null} assumed={assumed} inline />
              {field === 'destination' && (
                <div className="mt-2 flex justify-start border-t border-white/[0.07] pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit({ field: 'destination', value: null })}
                    className="text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200"
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </Combobox>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Combobox
      items={SUPPORTED_PLACES}
      value={current}
      open={open}
      autoHighlight
      itemToStringLabel={(place) => `${place.city} ${place.iata}`}
      itemToStringValue={(place) => place.iata}
      isItemEqualToValue={(place, value) => place.iata === value.iata}
      onOpenChange={onOpenChange}
      onValueChange={selectPlace}
    >
      <ComboboxTrigger
        aria-label={triggerLabel}
        className={`${triggerClass} [&>svg]:size-3 [&>svg]:text-neutral-500`}
      >
        <MapPin aria-hidden="true" className="size-3 text-neutral-500" />
        <ChipBody chip={chip} />
      </ComboboxTrigger>
      <ComboboxContent
        aria-label={`Edit ${chip.label}`}
        align="start"
        sideOffset={6}
        className="dark w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#17171f] p-0 shadow-[0_18px_50px_rgba(0,0,0,0.62)]"
      >
        <ComboboxInput
          autoFocus
          showTrigger={false}
          aria-label="Search airports"
          placeholder="Search city or airport code"
          className="m-2 w-[calc(100%-1rem)] **:data-[slot=input-group-control]:h-9 **:data-[slot=input-group-control]:text-xs"
        />
        <AirportOptions currentIata={current?.iata ?? null} assumed={assumed} />
        {field === 'destination' && (
          <div className="border-t border-white/[0.07] p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit({ field: 'destination', value: null })}
              className="text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Clear
            </Button>
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  )
}

function AirportOptions({
  currentIata,
  assumed,
  inline = false,
}: {
  currentIata: string | null
  assumed: boolean
  inline?: boolean
}) {
  const filteredItems = useComboboxFilteredItems()
  const empty = filteredItems.length === 0

  if (inline && empty) {
    return (
      <p
        role="status"
        className="border-y border-white/[0.07] px-3 py-8 text-center text-xs text-neutral-500"
      >
        No supported airports found.
      </p>
    )
  }

  return (
    <>
      {!inline && (
        <ComboboxEmpty className="px-3 py-6 text-xs text-neutral-500">
          No supported airports found.
        </ComboboxEmpty>
      )}
      <ComboboxList
        className={
          inline
            ? 'mt-2 max-h-[48dvh] border-y border-white/[0.07] p-1.5'
            : 'max-h-72 border-t border-white/[0.07] p-1.5'
        }
      >
        {(place) => (
          <ComboboxItem
            key={place.iata}
            value={place}
            data-confirm={place.iata === currentIata && assumed ? '' : undefined}
            className="min-h-10 cursor-pointer rounded-lg py-2 pr-8 pl-2.5 text-xs text-neutral-200 data-confirm:pr-2 data-confirm:[&_[data-slot=combobox-item-indicator]]:hidden data-highlighted:bg-white/[0.07] data-highlighted:text-white"
          >
            <span className="min-w-0 flex-1 truncate">{place.city}</span>
            <span className="font-mono text-[11px] tracking-wider text-neutral-500">
              {place.iata}
            </span>
            {place.iata === currentIata && assumed && (
              <span className="text-[10px] text-amber-300/80">confirm</span>
            )}
          </ComboboxItem>
        )}
      </ComboboxList>
    </>
  )
}

function SimpleChoiceChip({
  chip,
  field,
  intent,
  open,
  animation,
  onOpenChange,
  onEdit,
}: {
  chip: ChipView
  field: SimpleField
  intent: TripIntent
  open: boolean
  animation: ChipAnimation | undefined
  onOpenChange: (open: boolean) => void
  onEdit: (edit: IntentEdit) => void
}) {
  const definition = SIMPLE_FIELD_DEFINITIONS[field]
  const { clearEdit } = definition

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        className={`${chipClasses(chip, animation)} ${CHIP_TRIGGER_INTERACTION}`}
      >
        <ChipBody chip={chip} />
        <ChevronDown aria-hidden="true" className="size-3 text-neutral-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="dark min-w-44 rounded-xl border border-white/10 bg-[#17171f] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.62)]"
      >
        <DropdownMenuRadioGroup
          value={definition.currentValue(intent)}
          onValueChange={(value) => onEdit(definition.valueEdit(String(value)))}
        >
          <DropdownMenuLabel className="px-2 py-1.5 text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
            {chip.label}
          </DropdownMenuLabel>
          {definition.options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              closeOnClick
              className="min-h-9 cursor-pointer rounded-lg px-2.5 py-2 text-xs text-neutral-200 data-highlighted:bg-white/[0.07] data-highlighted:text-white"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {clearEdit !== null && (
          <>
            <DropdownMenuSeparator className="mx-1 bg-white/[0.08]" />
            <DropdownMenuItem
              closeOnClick
              onClick={() => onEdit(clearEdit)}
              className="min-h-9 cursor-pointer rounded-lg px-2.5 py-2 text-xs text-neutral-500 data-highlighted:bg-white/[0.06] data-highlighted:text-neutral-200"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Clear
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function isSimpleField(field: IntentField): field is SimpleField {
  return Object.hasOwn(SIMPLE_FIELD_DEFINITIONS, field)
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
      <span className="text-[10px] tracking-wide text-neutral-500 uppercase">{chip.label}</span>
      <span className="font-medium text-neutral-100">{chip.value}</span>
      {chip.assumed && <span className="text-[10px] text-amber-400/90">assumed</span>}
    </>
  )
}
