/** Rules of the workout flow, shared by the day and exercise screens (pure, unit-tested). */
import { groupByMuscle } from '@/features/workouts/format'
import type { Day, Exercise } from '@/features/workouts/types'

import type { DayWeek, LoggedSet, PastSession, TrainingSession } from './types'

/** Rest when the plan gives none (warm-ups), as in the design. */
export const DEFAULT_REST_SECONDS = 90
const DEFAULT_REPS = 10

/** Sets that make an exercise done. Plans without a count (cardio, warm-ups) need one. */
export function plannedSets(exercise: Pick<Exercise, 'sets'>): number {
  return exercise.sets ?? 1
}

export function setsOf(session: TrainingSession | null, exerciseId: string): LoggedSet[] {
  return (session?.sets ?? [])
    .filter((set) => set.exercise_id === exerciseId)
    .sort((a, b) => a.set_number - b.set_number)
}

/** Ticked off by hand (only this kind of "done" can be undone from the list). */
export function isTicked(exercise: Pick<Exercise, 'id'>, session: TrainingSession | null): boolean {
  return session?.done_exercise_ids.includes(exercise.id) ?? false
}

export function isDone(exercise: Exercise, session: TrainingSession | null): boolean {
  return isTicked(exercise, session) || setsOf(session, exercise.id).length >= plannedSets(exercise)
}

export function dayProgress(day: Day, session: TrainingSession | null) {
  return {
    done: day.exercises.filter((exercise) => isDone(exercise, session)).length,
    total: day.exercises.length,
  }
}

/** A day this week is done when finished with "Terminar treino" or every exercise is done. */
export function isDayDone(status: DayWeek | undefined): boolean {
  if (!status) return false
  return status.finished || (status.exercises_total > 0 && status.exercises_done === status.exercises_total)
}

/** The day's exercises in the order the screen lists them (muscle groups by first appearance). */
export function screenOrder(day: Day): Exercise[] {
  return groupByMuscle(day.exercises).flatMap((group) => group.exercises)
}

export function nextExercise(day: Day, exerciseId: string): Exercise | null {
  const order = screenOrder(day)
  const index = order.findIndex((exercise) => exercise.id === exerciseId)
  return index >= 0 ? (order[index + 1] ?? null) : null
}

/** Reps the plan prescribes for set `index` (0-based): "15/12/10" → 15, 12, 10, 10…; "8-12" → 12. */
export function plannedReps(reps: string | null, index: number): number | null {
  if (!reps) return null
  const parts = reps.split('/')
  const part = parts[Math.min(index, parts.length - 1)].trim()
  const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
  return match ? Number(match[2] ?? match[1]) : null
}

/** Heaviest set of a past session: the "Última" weight. */
export function topWeight(session: PastSession | undefined): number | null {
  return session?.sets.length ? Math.max(...session.sets.map((set) => set.weight)) : null
}

/**
 * What to pre-fill for set `index`: weight from today's last set, else the same set last time
 * (progressions change weight set by set), else last time's final set; reps from the plan.
 */
export function suggestion(
  exercise: Pick<Exercise, 'reps'>,
  index: number,
  today: LoggedSet[],
  last: PastSession | undefined,
): { weightKg: number; reps: number } {
  const previous = last?.sets[index] ?? last?.sets.at(-1)
  const weightKg = today.at(-1)?.weight ?? previous?.weight ?? 0
  const reps = plannedReps(exercise.reps, index) ?? today.at(-1)?.reps ?? previous?.reps ?? DEFAULT_REPS
  return { weightKg, reps }
}

export function restSeconds(exercise: Pick<Exercise, 'rest_seconds'>): number {
  return exercise.rest_seconds ?? DEFAULT_REST_SECONDS
}

/** "YYYY-MM-DD" (a local date from the API) → 0 = Monday … 6 = Sunday. */
export function weekdayOf(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

/** "YYYY-MM-DD" plus `days`, as "YYYY-MM-DD". */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}
