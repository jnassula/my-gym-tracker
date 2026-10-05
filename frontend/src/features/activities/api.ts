import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { progressKeys } from '@/features/progress/api'
import { trainingKeys } from '@/features/training/api'
import { api } from '@/lib/api'

import type { Activities, Activity, ActivityDraft } from './types'

const KEY = ['activities'] as const

export const activitiesQuery = () =>
  queryOptions({ queryKey: KEY, queryFn: () => api<Activities>('/api/activities') })

/** An activity or one of its days changed: the week's suggestion and the calendar follow. */
function refresh(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: KEY }),
    queryClient.invalidateQueries({ queryKey: trainingKeys.weeks }),
    queryClient.invalidateQueries({ queryKey: [...progressKeys.all, 'calendar'] }),
  ])
}

/** Creates the activity, or changes the one with `id`. */
export function useSaveActivity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: ActivityDraft }) =>
      id
        ? api<Activity>(`/api/activities/${id}`, { method: 'PATCH', body: draft })
        : api<Activity>('/api/activities', { method: 'POST', body: draft }),
    onSuccess: () => refresh(queryClient),
  })
}

/** Archives it: off the days to come, its past days kept. */
export function useArchiveActivity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/activities/${id}`, { method: 'DELETE' }),
    onSuccess: () => refresh(queryClient),
  })
}

/** The activity is on that date, or isn't ("não fui", for one of its fixed days). */
export function useSetActivityDay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ activityId, date, on }: { activityId: string; date: string; on: boolean }) =>
      api<void>(`/api/activities/${activityId}/days/${date}`, { method: on ? 'PUT' : 'DELETE' }),
    onSuccess: () => refresh(queryClient),
  })
}
