/** Searching the exercise library: no accents, the chosen group first, custom names. Pure. */
import type { MuscleGroup } from '../types'

export type LibrarySource = 'plan' | 'base'

export type LibraryEntry = {
  name: string
  muscle_group: MuscleGroup
  source: LibrarySource
  plan_name: string | null
  /** kg */
  last_weight: string | null
}

export type Library = { entries: LibraryEntry[] }

export type Pick = { name: string; muscle_group: MuscleGroup }

/** "name|group": how the day's exercises are told apart from the library's. */
export const pickKey = (pick: Pick) => `${fold(pick.name)}|${pick.muscle_group}`

/** "Personalizados" lists what came from the user's own plans. */
export type LibraryFilter = MuscleGroup | 'all' | 'mine'

/** "remada" matches "Remada Curvada"; "gemeos" matches "Gémeos em Pé". */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function matches(entry: LibraryEntry, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const name = fold(entry.name)
  return words.every((word) => name.includes(word))
}

/**
 * The entries to show: those matching every word of the query, within the filter. With a
 * group filter other groups still appear after it, so a search isn't a dead end when the
 * exercise is filed elsewhere ("Remada Alta" under shoulders while looking at back).
 */
export function search(entries: LibraryEntry[], query: string, filter: LibraryFilter): LibraryEntry[] {
  const hits = entries.filter((entry) => matches(entry, query))
  if (filter === 'all') return hits
  if (filter === 'mine') return hits.filter((entry) => entry.source === 'plan')
  const inGroup = hits.filter((entry) => entry.muscle_group === filter)
  // Without a query, the group's own exercises are the list; with one, the rest follows.
  return query.trim() === '' ? inGroup : [...inGroup, ...hits.filter((entry) => entry.muscle_group !== filter)]
}

/** A typed name that isn't in the list yet becomes a custom exercise. */
export function isNewName(entries: LibraryEntry[], query: string): boolean {
  const wanted = fold(query)
  return wanted !== '' && !entries.some((entry) => fold(entry.name) === wanted)
}

/** The filter chips: the chosen group leads, then all, the rest of the groups and "mine". */
export function filterOrder(groups: readonly MuscleGroup[], chosen: MuscleGroup | null): LibraryFilter[] {
  const rest = groups.filter((group) => group !== chosen)
  return [...(chosen ? [chosen] : []), 'all', ...rest, 'mine']
}
