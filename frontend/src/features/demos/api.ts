import { queryOptions, type QueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

/** The animation that shows an exercise: its id in the catalogue and the catalogue's name for it. */
export type Demo = { id: string; name: string }

const keys = {
  all: ['demos'] as const,
  exercise: (exerciseId: string) => ['demos', 'exercise', exerciseId] as const,
  gif: (demoId: string) => ['demos', 'gif', demoId] as const,
}

/** Which animation shows this exercise; null when none does (or none was chosen yet). */
export const demoQuery = (exerciseId: string) =>
  queryOptions({
    queryKey: keys.exercise(exerciseId),
    queryFn: () => api<Demo | null>(`/api/demos/exercises/${exerciseId}`),
  })

/**
 * The animation as an object URL an <img> can show (it needs the session, so it is fetched, not
 * linked). An id's animation never changes: kept for as long as the page lives, released when
 * the session ends (`releaseDemos`).
 */
export const demoGifQuery = (demoId: string) =>
  queryOptions({
    queryKey: keys.gif(demoId),
    queryFn: async () => URL.createObjectURL(await api<Blob>(`/api/demos/${demoId}.gif`, { responseType: 'blob' })),
    staleTime: Infinity,
    gcTime: Infinity,
  })

/** The session ended: no animation's object URL outlives it in this tab. */
export function releaseDemos(queryClient: QueryClient) {
  for (const [, url] of queryClient.getQueriesData<string>({ queryKey: ['demos', 'gif'] })) {
    if (url) URL.revokeObjectURL(url)
  }
}
