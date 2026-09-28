/** Mirrors the backend schemas in app/workouts/schemas.py. */

export const MUSCLE_GROUPS = [
  'warmup',
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
  'cardio',
  'other',
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const
export type Weekday = (typeof WEEKDAYS)[number]

export type ParseWarning =
  | 'unknown_muscle_group'
  | 'no_sets'
  | 'technique_sets'
  | 'combined_exercise'
  | 'alternative_exercise'

export type ExerciseFields = {
  name: string
  muscle_group: MuscleGroup | null
  sets: number | null
  reps: string | null
  rest_seconds: number | null
  rest_max_seconds: number | null
  notes: string | null
}

export type ExercisePreview = ExerciseFields & { warnings: ParseWarning[] }

export type ImportPreview = {
  file_id: string
  filename: string
  name: string
  valid_until: string | null
  rest_days: Weekday[]
  days: Array<{ weekday: Weekday | null; label: string; exercises: ExercisePreview[] }>
}

export type PlanCreate = {
  name: string
  source_file_id: string | null
  valid_until: string | null
  activate: boolean
  days: Array<{ weekday: Weekday | null; label: string; exercises: ExerciseFields[] }>
}

export type Exercise = ExerciseFields & { id: string; position: number }

export type Day = {
  id: string
  weekday: Weekday | null
  label: string
  position: number
  exercises: Exercise[]
}

export type Plan = {
  id: string
  name: string
  is_active: boolean
  valid_until: string | null
  source_file_id: string | null
  created_at: string
  days: Day[]
}

export type PlanSummary = Omit<Plan, 'days'> & { weekdays: Weekday[]; exercise_count: number }
