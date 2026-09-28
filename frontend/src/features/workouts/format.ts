import type { ExerciseFields, MuscleGroup } from './types'

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/** 90 → "1:30"; 60–120 → "1–2 min"; 45–90 → "0:45–1:30". */
export function formatRest(min: number | null, max: number | null): string | null {
  if (min === null) return null
  if (max === null) return clock(min)
  if (min % 60 === 0 && max % 60 === 0) return `${min / 60}–${max / 60} min`
  return `${clock(min)}–${clock(max)}`
}

/** "8-12" → "8–12", matching the design's typography. */
export function formatReps(reps: string): string {
  return reps.replace(/(\d)-(\d)/g, '$1–$2')
}

/** "3×12 · 1:30" style summary; pieces missing from the PDF are simply left out. */
export function formatScheme(
  exercise: Pick<ExerciseFields, 'sets' | 'reps' | 'rest_seconds' | 'rest_max_seconds'>,
  labels: { setsOnly: (sets: number) => string },
): string {
  const { sets, reps } = exercise
  const volume =
    sets !== null && reps !== null
      ? `${sets}×${formatReps(reps)}`
      : sets !== null
        ? labels.setsOnly(sets)
        : reps !== null
          ? formatReps(reps)
          : null
  const rest = formatRest(exercise.rest_seconds, exercise.rest_max_seconds)
  return [volume, rest].filter(Boolean).join(' · ')
}

export function formatFileSize(bytes: number, locale: string): string {
  const megabytes = bytes / (1024 * 1024)
  if (megabytes < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(megabytes)} MB`
}

/** Consecutive-by-first-appearance grouping, as the design lists exercises under group headings. */
export function groupByMuscle<T extends { muscle_group: MuscleGroup | null }>(
  exercises: T[],
): Array<{ group: MuscleGroup | null; exercises: T[] }> {
  const groups = new Map<MuscleGroup | null, T[]>()
  for (const exercise of exercises) {
    const list = groups.get(exercise.muscle_group) ?? []
    list.push(exercise)
    groups.set(exercise.muscle_group, list)
  }
  return [...groups].map(([group, items]) => ({ group, exercises: items }))
}

/** A calendar date from the API ("2026-04-15") in the user's language, e.g. "15 abr. 2026". */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${iso}T00:00:00`),
  )
}
