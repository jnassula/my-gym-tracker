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
  /** Only on logging a set: it beat every earlier date's heaviest (a personal record). */
  new_record?: boolean
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

export type ExerciseHistory = {
  sessions: PastSession[]
  best_weight: number | null
  /** Heaviest set of each of the last 8 sessions, oldest first (the "Progressão" sparkline). */
  recent: Array<{ date: string; weight: number }>
}

export type DayWeek = {
  day_id: string
  /** This week's latest session for the day. */
  session_id: string | null
  date: string | null
  finished: boolean
  exercises_done: number
  exercises_total: number
  sets: number
  /** Trained this week: on an earlier day (however far it got), or complete today. */
  trained: boolean
  /** Today's activities (footvolley, surf) this workout shouldn't share the day with. */
  avoid: string[]
}

/** An activity besides the gym on a date; `fixed`: there by its weekday, nothing said of the date. */
export type WeekActivity = { activity_id: string; name: string; date: string; fixed: boolean }

/** A workout of this week on its date; `day_id` may be another plan's day, or gone. */
export type WeekWorkout = { session_id: string; day_id: string | null; date: string; complete: boolean }

/**
 * Which workout today (the server's rule, `app/logs/week.py`): one to carry on, the one done, the
 * one suggested, or (rest, complete) the one that would come next. `reason` goes with `suggest`;
 * a newer server may send reasons this app doesn't know.
 */
export type Suggestion = {
  kind: 'continue' | 'done' | 'suggest' | 'rest' | 'complete'
  day_id: string | null
  reason: string | null
  /** The activities behind a reason they gave: tomorrow's, or today's. */
  because: string[]
}

export type PlanWeek = {
  today: string
  week_start: string
  days: DayWeek[]
  /** Workouts the plan asks of a week, and how many of this week's count already. */
  target: number
  workouts_done: number
  /** Every workout of the week, oldest first. */
  sessions: WeekWorkout[]
  suggestion: Suggestion
  /** The user's other activities by date, Monday to the Monday after. */
  activities: WeekActivity[]
}

/** The week as an older server sends it (after a rollback): before the flexible week it had no
 * suggestion, before the activities none of those. */
export type OlderWeek = Pick<PlanWeek, 'today' | 'week_start'> &
  Partial<Pick<PlanWeek, 'target' | 'workouts_done' | 'sessions' | 'activities'>> & {
    days: Array<Omit<DayWeek, 'trained' | 'avoid'> & { trained?: boolean; avoid?: string[] }>
    suggestion?: Omit<Suggestion, 'because'> & { because?: string[] }
  }

export type PersonalRecord = { exercise_id: string; name: string; weight: number }

export type SessionSummary = {
  session_id: string
  sets: number
  volume: number
  duration_seconds: number
  records: PersonalRecord[]
}
