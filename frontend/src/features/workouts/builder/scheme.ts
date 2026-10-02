/** The rules of the "Configurar exercício" sheet: presets, steppers and reps per set. Pure. */

export const PRESETS = [
  { sets: 3, reps: '12' },
  { sets: 4, reps: '10' },
  { sets: 5, reps: '5' },
] as const

export const MIN_SETS = 1
export const MAX_SETS = 12
export const REST_STEP = 15
export const MAX_REST = 600
/** The reps column is 32 characters wide in the database. */
export const MAX_REPS_LENGTH = 32

export const clampSets = (sets: number) => Math.min(MAX_SETS, Math.max(MIN_SETS, Math.round(sets)))

export const clampRest = (seconds: number) =>
  Math.min(MAX_REST, Math.max(0, Math.round(seconds / REST_STEP) * REST_STEP))

/** "15/12/10/8" is a progression: one reps figure per set. */
export const isProgression = (reps: string | null) => reps !== null && reps.includes('/')

/**
 * One reps figure per set, from the scheme as stored: "12" → ["12", "12", "12"];
 * "15/12/10/8" with 3 sets → the first three; with 5 → the last one repeats.
 */
export function repsPerSet(reps: string | null, sets: number): string[] {
  const parts = (reps ?? '').split('/').map((part) => part.trim())
  const last = parts.at(-1) ?? ''
  return Array.from({ length: sets }, (_, index) => parts[index] ?? last)
}

/** The scheme to store: the figure alone when every set is the same, else joined with "/". */
export function joinReps(perSet: string[]): string | null {
  const parts = perSet.map((part) => part.trim()).filter((part) => part !== '')
  if (parts.length === 0) return null
  const scheme = parts.every((part) => part === parts[0]) ? parts[0] : parts.join('/')
  return scheme.slice(0, MAX_REPS_LENGTH)
}

export function matchesPreset(
  exercise: { sets: number | null; reps: string | null },
  preset: { sets: number; reps: string },
): boolean {
  return exercise.sets === preset.sets && exercise.reps === preset.reps
}
