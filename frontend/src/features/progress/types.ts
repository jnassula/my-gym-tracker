/** Mirrors the backend schemas in app/progress/schemas.py. Weights are kilograms. */
import type { MuscleGroup } from '@/features/workouts/types'

export type Range = '4w' | '3m' | '1y'
export const RANGES: Range[] = ['4w', '3m', '1y']

export type WeightPoint = { date: string; weight: number }

export type ExerciseTrend = {
  /** The most recently trained exercise with this name and group. */
  exercise_id: string
  name: string
  muscle_group: MuscleGroup | null
  best_weight: number
  recent: WeightPoint[]
  trend: number
  last_date: string
}

/** The newest personal record: Início's "Último recorde". */
export type LastRecord = { exercise_id: string; name: string; weight: number; date: string }

export type ProgressOverview = {
  week_streak: number
  week_volume: number
  records_this_month: number
  last_record: LastRecord | null
  sets_by_group: Array<{ muscle_group: MuscleGroup | null; sets: number }>
  exercises: ExerciseTrend[]
}

export type ExerciseProgress = {
  exercise_id: string
  name: string
  muscle_group: MuscleGroup | null
  range: Range
  points: WeightPoint[]
  best_weight: number | null
  volume: number
  trend: number | null
  sessions: Array<{ date: string; weight: number; reps: number; volume: number }>
}

export type DayStatus = 'trained' | 'missed' | 'rest' | 'today' | 'future'

export type WeekSession = {
  session_id: string
  date: string
  weekday: number
  label: string
  duration_seconds: number
  sets: number
  exercises_done: number
  exercises_total: number
}

export type ProgressCalendar = {
  month: string
  today: string
  days: Array<{ date: string; status: DayStatus }>
  week_streak: number
  sessions_total: number
  adherence_30d: number | null
  this_week: WeekSession[]
}

export type Totals = { volume: number; sets: number; duration_seconds: number }

export type WeekComparison = {
  week_start: string
  iso_week: number
  last_iso_week: number
  until_weekday: number
  this_week: Totals
  last_week: Totals
  days: Array<{ weekday: number; this_week: number; last_week: number }>
  today: {
    day_id: string
    label: string
    exercises: Array<{ exercise_id: string; name: string; last_week: number | null; this_week: number | null }>
  } | null
}

export type HeartRatePoint = { at: string; bpm: number }

export type SessionExercise = {
  exercise_id: string
  name: string
  muscle_group: MuscleGroup | null
  sets: number
  top_weight: number
  first_set_at: string
  /** The highest heart rate around any of its sets; null without watch data. */
  peak_heart_rate: number | null
}

/** What the Apple Watch recorded during the session, once the shortcut synced. */
export type SessionHealth = {
  /** The session's window: a little before the first set to after the last. */
  starts_at: string
  ends_at: string
  avg_heart_rate: number | null
  max_heart_rate: number | null
  /** Active kcal. */
  calories: number | null
  heart_rate: HeartRatePoint[]
}

export type SessionDetail = {
  session_id: string
  date: string
  label: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
  /** Working sets. */
  sets: number
  volume: number
  /** In the order they were first logged. */
  exercises: SessionExercise[]
  health: SessionHealth | null
}
