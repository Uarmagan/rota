import {
  tripIntentSchema,
  type Cabin,
  type DateWindow,
  type Nonstop,
  type Place,
  type Priority,
  type TripIntent,
} from '../schema/trip-intent'

export type IntentEdit =
  | { field: 'travelers'; value: number }
  | { field: 'origin'; value: Place }
  | { field: 'destination'; value: Place | null }
  | { field: 'cabin'; value: Cabin }
  | { field: 'dates'; value: DateWindow | null }
  | { field: 'priority'; value: Priority | null }
  | { field: 'constraints.nonstop'; value: Nonstop | null }
  | { field: 'constraints.arriveBy'; value: string | null }
  | { field: 'constraints.departAfter'; value: string | null }
  | { field: 'constraints.avoidRedeye'; value: boolean | null }
  | { field: 'constraints.avoidLateArrival'; value: boolean | null }

export function applyIntentEdit(intent: TripIntent, edit: IntentEdit): TripIntent {
  let next: TripIntent
  switch (edit.field) {
    case 'travelers':
      next = { ...intent, travelers: edit.value }
      break
    case 'origin':
      next = { ...intent, origin: { ...edit.value, assumed: false } }
      break
    case 'destination':
      next = { ...intent, destination: edit.value }
      break
    case 'cabin':
      next = { ...intent, cabin: edit.value }
      break
    case 'dates':
      next = { ...intent, dates: edit.value }
      break
    case 'priority':
      next = { ...intent, priority: edit.value }
      break
    case 'constraints.nonstop':
      next = {
        ...intent,
        constraints: { ...intent.constraints, nonstop: edit.value },
      }
      break
    case 'constraints.arriveBy':
      next = {
        ...intent,
        constraints: { ...intent.constraints, arriveBy: edit.value },
      }
      break
    case 'constraints.departAfter':
      next = {
        ...intent,
        constraints: { ...intent.constraints, departAfter: edit.value },
      }
      break
    case 'constraints.avoidRedeye':
      next = {
        ...intent,
        constraints: { ...intent.constraints, avoidRedeye: edit.value },
      }
      break
    case 'constraints.avoidLateArrival':
      next = {
        ...intent,
        constraints: { ...intent.constraints, avoidLateArrival: edit.value },
      }
      break
  }
  return tripIntentSchema.parse(next)
}
