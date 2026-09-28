/**
 * The import preview while the user reviews it. A pure reducer so the editing rules
 * (move, reorder, fix, confirm) are testable without rendering anything.
 */
import type {
  ExerciseFields,
  ExercisePreview,
  ImportPreview,
  MuscleGroup,
  PlanCreate,
  Weekday,
} from './types'

export type DraftExercise = ExercisePreview & { key: string }

export type DraftDay = {
  key: string
  weekday: Weekday | null
  label: string
  reviewed: boolean
  exercises: DraftExercise[]
}

export type Draft = {
  fileId: string
  filename: string
  name: string
  validUntil: string | null
  days: DraftDay[]
}

// Not crypto.randomUUID(): it is missing on plain-http LAN addresses (testing on a phone).
let sequence = 0
export const nextKey = () => `k${++sequence}`

export function draftFromPreview(preview: ImportPreview): Draft {
  return {
    fileId: preview.file_id,
    filename: preview.filename,
    name: preview.name,
    validUntil: preview.valid_until,
    days: preview.days.map((day) => ({
      key: nextKey(),
      weekday: day.weekday,
      label: day.label,
      reviewed: false,
      exercises: day.exercises.map((exercise) => ({ ...exercise, key: nextKey() })),
    })),
  }
}

export type DraftAction =
  | { type: 'rename-plan'; name: string }
  | { type: 'update-exercise'; day: string; exercise: string; fields: ExerciseFields }
  | { type: 'add-exercise'; day: string; fields: ExerciseFields }
  | { type: 'delete-exercise'; day: string; exercise: string }
  | { type: 'move-exercise'; day: string; exercise: string; toDay: string; toGroup: MuscleGroup | null }
  | { type: 'shift-exercise'; day: string; exercise: string; direction: -1 | 1 }
  | { type: 'mark-reviewed'; day: string }
  | { type: 'mark-all-reviewed' }

function mapDay(draft: Draft, key: string, update: (day: DraftDay) => DraftDay): Draft {
  return { ...draft, days: draft.days.map((day) => (day.key === key ? update(day) : day)) }
}

/** Swap with the neighbour of the same muscle group (the rows the user sees together). */
function shift(exercises: DraftExercise[], key: string, direction: -1 | 1): DraftExercise[] {
  const index = exercises.findIndex((e) => e.key === key)
  if (index < 0) return exercises
  const group = exercises[index].muscle_group
  let target = index + direction
  while (target >= 0 && target < exercises.length && exercises[target].muscle_group !== group) {
    target += direction
  }
  if (target < 0 || target >= exercises.length) return exercises
  const next = [...exercises]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case 'rename-plan':
      return { ...draft, name: action.name }
    case 'update-exercise':
      // Editing an exercise is the review: its warnings are resolved.
      return mapDay(draft, action.day, (day) => ({
        ...day,
        exercises: day.exercises.map((e) =>
          e.key === action.exercise ? { ...action.fields, key: e.key, warnings: [] } : e,
        ),
      }))
    case 'add-exercise':
      return mapDay(draft, action.day, (day) => ({
        ...day,
        exercises: [...day.exercises, { ...action.fields, key: nextKey(), warnings: [] }],
      }))
    case 'delete-exercise':
      return mapDay(draft, action.day, (day) => ({
        ...day,
        exercises: day.exercises.filter((e) => e.key !== action.exercise),
      }))
    case 'move-exercise': {
      const source = draft.days.find((d) => d.key === action.day)
      const moving = source?.exercises.find((e) => e.key === action.exercise)
      if (!moving) return draft
      const moved = {
        ...moving,
        muscle_group: action.toGroup,
        warnings: moving.warnings.filter((w) => w !== 'unknown_muscle_group' || !action.toGroup),
      }
      const without = mapDay(draft, action.day, (day) => ({
        ...day,
        exercises: day.exercises.filter((e) => e.key !== action.exercise),
      }))
      if (action.toDay === action.day) {
        // Same day, new group: keep its place in the list.
        return mapDay(draft, action.day, (day) => ({
          ...day,
          exercises: day.exercises.map((e) => (e.key === moving.key ? moved : e)),
        }))
      }
      return mapDay(without, action.toDay, (day) => ({ ...day, exercises: [...day.exercises, moved] }))
    }
    case 'shift-exercise':
      return mapDay(draft, action.day, (day) => ({
        ...day,
        exercises: shift(day.exercises, action.exercise, action.direction),
      }))
    case 'mark-reviewed':
      return mapDay(draft, action.day, (day) => ({ ...day, reviewed: true }))
    case 'mark-all-reviewed':
      return { ...draft, days: draft.days.map((day) => ({ ...day, reviewed: true })) }
  }
}

export function fieldsOf(exercise: ExerciseFields): ExerciseFields {
  const { name, muscle_group, sets, reps, rest_seconds, rest_max_seconds, notes } = exercise
  return { name, muscle_group, sets, reps, rest_seconds, rest_max_seconds, notes }
}

/** The body for POST /api/workouts. Days left without exercises are dropped. */
export function toPlanCreate(draft: Draft, activate = true): PlanCreate {
  return {
    name: draft.name.trim(),
    source_file_id: draft.fileId,
    valid_until: draft.validUntil,
    activate,
    days: draft.days
      .filter((day) => day.exercises.length > 0)
      .map((day) => ({
        weekday: day.weekday,
        label: day.label,
        exercises: day.exercises.map(fieldsOf),
      })),
  }
}
