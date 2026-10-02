import { useTranslation } from 'react-i18next'

import { formatScheme } from './format'
import type { ExerciseFields, MuscleGroup, Weekday } from './types'

/** Translated names for the workout vocabulary (groups, weekdays, schemes). */
export function useWorkoutLabels() {
  const { t } = useTranslation()
  return {
    group: (group: MuscleGroup | null) => t(`muscleGroups.${group ?? 'none'}`),
    weekdayShort: (weekday: Weekday | null) =>
      weekday === null ? t('weekdays.none') : t(`weekdays.short.${weekday}`),
    weekdayLong: (weekday: Weekday | null) =>
      weekday === null ? t('weekdays.none') : t(`weekdays.long.${weekday}`),
    /** "3 dias · 11 exercícios". */
    summary: (days: number, exercises: number) =>
      `${t('workouts.dayCount', { count: days })} · ${t('workouts.exerciseCount', { count: exercises })}`,
    scheme: (exercise: Pick<ExerciseFields, 'sets' | 'reps' | 'rest_seconds' | 'rest_max_seconds'>) =>
      formatScheme(exercise, { setsOnly: (sets) => t('exercise.setsOnly', { sets }) }),
  }
}
