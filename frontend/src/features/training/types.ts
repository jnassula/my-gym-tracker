/** Mirrors the backend schemas in app/logs/schemas.py. Weights are always kilograms. */

export type LoggedSet = {
  id: string
  exercise_id: string
  set_number: number
  weight: number
  reps: number
  performed_at: string
}

export type TrainingSession = {
  id: string
  day_id: string | null
  local_date: string
  started_at: string
  ended_at: string | null
  done_exercise_ids: string[]
  sets: LoggedSet[]
}

export type PastSet = { weight: number; reps: number }

/** An exercise's sets on an earlier date ("última" or a history row). */
export type PastSession = { date: string; sets: PastSet[] }

export type DayLog = {
  day_id: string
  today: string
  session: TrainingSession | null
  /** By exercise id; exercises never trained are missing. */
  last: Record<string, PastSession>
}

export type ExerciseHistory = { sessions: PastSession[]; best_weight: number | null }

export type DayWeek = {
  day_id: string
  session_id: string | null
  date: string | null
  finished: boolean
  exercises_done: number
  exercises_total: number
  sets: number
}

export type PlanWeek = { today: string; week_start: string; days: DayWeek[] }

export type PersonalRecord = { exercise_id: string; name: string; weight: number }

export type SessionSummary = {
  session_id: string
  sets: number
  volume: number
  duration_seconds: number
  records: PersonalRecord[]
}
