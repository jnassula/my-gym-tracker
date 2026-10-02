/**
 * A plan being built from scratch ("Criar do zero"): a pure reducer, like the import
 * review's, so the editing rules are testable without rendering anything. The draft is
 * richer than the API (group cards may be empty, techniques are kept apart from the notes)
 * and `toPlanCreate` flattens it into the same body the import sends.
 */
import { nextKey, shift } from '../import-draft'
import type { ExerciseFields, MuscleGroup, Plan, PlanCreate, Weekday } from '../types'

export const TECHNIQUES = ['drop_set', 'rest_pause', 'cluster', 'isometric', 'partials'] as const
export type Technique = (typeof TECHNIQUES)[number]

export type BuilderExercise = ExerciseFields & { key: string; techniques: Technique[] }

export type BuilderDay = {
  key: string
  weekday: Weekday
  /** The group cards in the order shown; a group stays until removed, even when emptied. */
  groups: MuscleGroup[]
  exercises: BuilderExercise[]
}

export type BuilderDraft = {
  version: 1
  name: string
  validUntil: string | null
  /** Sorted by weekday; a weekday not here is a rest day. */
  days: BuilderDay[]
}

/** The group cards of each day, without exercises: a template, or another plan's shape. */
export type Structure = Array<{ groups: MuscleGroup[] }>

/** What every exercise starts with (the design's "3×12 · 1:30"), tuned afterwards. */
export const DEFAULT_EXERCISE: Omit<ExerciseFields, 'name' | 'muscle_group'> = {
  sets: 3,
  reps: '12',
  rest_seconds: 90,
  rest_max_seconds: null,
  notes: null,
}

export const MAX_EXERCISES_PER_DAY = 60

export function newExercise(name: string, group: MuscleGroup): BuilderExercise {
  return { ...DEFAULT_EXERCISE, name, muscle_group: group, key: nextKey(), techniques: [] }
}

function newDay(weekday: Weekday, groups: MuscleGroup[] = []): BuilderDay {
  return { key: nextKey(), weekday, groups, exercises: [] }
}

export function emptyDraft(name = ''): BuilderDraft {
  return { version: 1, name, validUntil: null, days: [] }
}

/** Keep each day's exercises under a group card, in the order the exercises were added. */
export function groupsOf(day: BuilderDay): Array<{ group: MuscleGroup; exercises: BuilderExercise[] }> {
  return day.groups.map((group) => ({
    group,
    exercises: day.exercises.filter((exercise) => exercise.muscle_group === group),
  }))
}

const unique = <T>(items: T[]) => [...new Set(items)]

/** A new day never comes with a group the exercises don't have, and never loses one they do. */
function withGroupsOf(day: BuilderDay): BuilderDay {
  const needed = day.exercises.map((exercise) => exercise.muscle_group ?? 'other')
  return { ...day, groups: unique([...day.groups, ...needed]) }
}

const byWeekday = (days: BuilderDay[]) => [...days].sort((a, b) => a.weekday - b.weekday)

/** "Duplicar treino existente": another plan's days, with new keys and no ids. */
export function draftFromPlan(plan: Plan, name: string): BuilderDraft {
  const scheduled = plan.days.filter((day) => day.weekday !== null)
  // A rotating plan (Treino A/B/C) has no weekdays: lay its days over Monday onwards.
  const source = scheduled.length > 0 ? scheduled : plan.days
  const days = source.slice(0, 7).map((day, index) =>
    withGroupsOf({
      key: nextKey(),
      weekday: (day.weekday ?? index) as Weekday,
      groups: [],
      exercises: day.exercises.map((exercise) => ({
        name: exercise.name,
        muscle_group: exercise.muscle_group ?? 'other',
        sets: exercise.sets,
        reps: exercise.reps,
        rest_seconds: exercise.rest_seconds,
        rest_max_seconds: exercise.rest_max_seconds,
        notes: exercise.notes,
        key: nextKey(),
        techniques: [],
      })),
    }),
  )
  // Two rotating days can't share a weekday: keep the first of each.
  const seen = new Set<Weekday>()
  return {
    version: 1,
    name,
    validUntil: null,
    days: byWeekday(days.filter((day) => !seen.has(day.weekday) && seen.add(day.weekday))),
  }
}

/** "Copiar estrutura de …": the groups of each day of a plan, in its order. */
export function structureOf(plan: Plan): Structure {
  return plan.days.map((day) => ({
    groups: unique(day.exercises.map((exercise) => exercise.muscle_group ?? 'other')),
  }))
}

export type BuilderAction =
  | { type: 'rename'; name: string }
  | { type: 'set-valid-until'; date: string | null }
  | { type: 'toggle-weekday'; weekday: Weekday }
  /** Lays a structure over the training days in order, cycling when it is shorter. */
  | { type: 'apply-structure'; structure: Structure }
  | { type: 'add-group'; day: string; group: MuscleGroup }
  | { type: 'remove-group'; day: string; group: MuscleGroup }
  | { type: 'add-exercise'; day: string; exercise: BuilderExercise }
  | { type: 'update-exercise'; day: string; exercise: BuilderExercise }
  | { type: 'delete-exercise'; day: string; exercise: string }
  | { type: 'move-exercise'; day: string; exercise: string; toDay: string; toGroup: MuscleGroup }
  | { type: 'shift-exercise'; day: string; exercise: string; direction: -1 | 1 }
  /** Replaces the target day's groups and exercises with copies of the source's. */
  | { type: 'copy-day'; day: string; toDay: string }

function mapDay(draft: BuilderDraft, key: string, update: (day: BuilderDay) => BuilderDay): BuilderDraft {
  return { ...draft, days: draft.days.map((day) => (day.key === key ? update(day) : day)) }
}

function without(day: BuilderDay, exerciseKey: string): BuilderDay {
  return { ...day, exercises: day.exercises.filter((e) => e.key !== exerciseKey) }
}

export function builderReducer(draft: BuilderDraft, action: BuilderAction): BuilderDraft {
  switch (action.type) {
    case 'rename':
      return { ...draft, name: action.name }
    case 'set-valid-until':
      return { ...draft, validUntil: action.date }
    case 'toggle-weekday': {
      const existing = draft.days.find((day) => day.weekday === action.weekday)
      if (existing) return { ...draft, days: draft.days.filter((day) => day !== existing) }
      return { ...draft, days: byWeekday([...draft.days, newDay(action.weekday)]) }
    }
    case 'apply-structure':
      if (action.structure.length === 0) return draft
      return {
        ...draft,
        days: draft.days.map((day, index) =>
          withGroupsOf({ ...day, groups: action.structure[index % action.structure.length].groups }),
        ),
      }
    case 'add-group':
      return mapDay(draft, action.day, (day) => ({ ...day, groups: unique([...day.groups, action.group]) }))
    case 'remove-group':
      return mapDay(draft, action.day, (day) => ({
        ...day,
        groups: day.groups.filter((group) => group !== action.group),
        exercises: day.exercises.filter((exercise) => exercise.muscle_group !== action.group),
      }))
    case 'add-exercise':
      return mapDay(draft, action.day, (day) =>
        day.exercises.length >= MAX_EXERCISES_PER_DAY
          ? day
          : withGroupsOf({ ...day, exercises: [...day.exercises, action.exercise] }),
      )
    case 'update-exercise':
      return mapDay(draft, action.day, (day) =>
        withGroupsOf({
          ...day,
          exercises: day.exercises.map((e) => (e.key === action.exercise.key ? action.exercise : e)),
        }),
      )
    case 'delete-exercise':
      return mapDay(draft, action.day, (day) => without(day, action.exercise))
    case 'move-exercise': {
      const source = draft.days.find((day) => day.key === action.day)
      const moving = source?.exercises.find((e) => e.key === action.exercise)
      if (!moving) return draft
      const moved = { ...moving, muscle_group: action.toGroup }
      if (action.toDay === action.day) {
        // Same day, another group: keep its place in the list.
        return mapDay(draft, action.day, (day) =>
          withGroupsOf({ ...day, exercises: day.exercises.map((e) => (e.key === moved.key ? moved : e)) }),
        )
      }
      const removed = mapDay(draft, action.day, (day) => without(day, action.exercise))
      return mapDay(removed, action.toDay, (day) =>
        withGroupsOf({ ...day, exercises: [...day.exercises, moved] }),
      )
    }
    case 'shift-exercise':
      return mapDay(draft, action.day, (day) => ({
        ...day,
        exercises: shift(day.exercises, action.exercise, action.direction),
      }))
    case 'copy-day': {
      const source = draft.days.find((day) => day.key === action.day)
      if (!source || action.toDay === action.day) return draft
      return mapDay(draft, action.toDay, (day) => ({
        ...day,
        groups: [...source.groups],
        exercises: source.exercises.map((exercise) => ({ ...exercise, key: nextKey() })),
      }))
    }
  }
}

// --- derived figures -------------------------------------------------------------------------

export const exerciseCount = (draft: BuilderDraft) =>
  draft.days.reduce((total, day) => total + day.exercises.length, 0)

/** Days that will be saved: the ones with at least one exercise (the rest are rest days). */
export const trainingDays = (draft: BuilderDraft) => draft.days.filter((day) => day.exercises.length > 0)

/** A rough session length: each set takes its rest plus about 45 s of work. */
export function estimateMinutes(day: BuilderDay): number {
  const seconds = day.exercises.reduce(
    (total, exercise) => total + (exercise.sets ?? 1) * (45 + (exercise.rest_seconds ?? 60)),
    0,
  )
  return Math.round(seconds / 60 / 5) * 5
}

export function averageMinutes(draft: BuilderDraft): number | null {
  const days = trainingDays(draft)
  if (days.length === 0) return null
  return Math.round(days.reduce((total, day) => total + estimateMinutes(day), 0) / days.length / 5) * 5
}

export const canSave = (draft: BuilderDraft) => draft.name.trim() !== '' && exerciseCount(draft) > 0

// --- the API body ----------------------------------------------------------------------------

export type Wording = {
  group: (group: MuscleGroup) => string
  technique: (technique: Technique) => string
}

/** The exercise's notes with its techniques in front: the model has no column for them. */
export function notesOf(exercise: BuilderExercise, wording: Wording): string | null {
  const parts = [...exercise.techniques.map(wording.technique), exercise.notes?.trim() || null]
  const notes = parts.filter(Boolean).join(' · ')
  return notes === '' ? null : notes
}

/** A day's label is its groups, as the trainer's PDFs write it ("Peitoral, Costas"). */
export function labelOf(day: BuilderDay, wording: Wording): string {
  const groups = groupsOf(day)
    .filter(({ group, exercises }) => exercises.length > 0 && group !== 'warmup')
    .map(({ group }) => wording.group(group))
  return groups.join(', ')
}

/** The body for POST /api/workouts: exercises in card order, empty days left out. */
export function toPlanCreate(draft: BuilderDraft, wording: Wording, activate: boolean): PlanCreate {
  return {
    name: draft.name.trim(),
    source_file_id: null,
    valid_until: draft.validUntil,
    activate,
    days: trainingDays(draft).map((day) => ({
      weekday: day.weekday,
      label: labelOf(day, wording),
      exercises: groupsOf(day).flatMap(({ exercises }) =>
        exercises.map((exercise) => ({
          name: exercise.name.trim(),
          muscle_group: exercise.muscle_group,
          sets: exercise.sets,
          reps: exercise.reps,
          rest_seconds: exercise.rest_seconds,
          rest_max_seconds: exercise.rest_max_seconds,
          notes: notesOf(exercise, wording),
        })),
      ),
    })),
  }
}
