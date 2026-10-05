import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

import { completeWeek } from './plan'
import type { DayLog, ExerciseHistory, OlderWeek, PlanWeek, SessionSummary, TrainingSession } from './types'

export const trainingKeys = {
  all: ['training'] as const,
  day: (dayId: string) => ['training', 'day', dayId] as const,
  history: (exerciseId: string) => ['training', 'history', exerciseId] as const,
  weeks: ['training', 'week'] as const,
  week: (planId: string) => ['training', 'week', planId] as const,
}

export const dayLogQuery = (dayId: string) =>
  queryOptions({
    queryKey: trainingKeys.day(dayId),
    queryFn: () => api<DayLog>(`/api/logs/days/${dayId}`),
  })

export const historyQuery = (exerciseId: string) =>
  queryOptions({
    queryKey: trainingKeys.history(exerciseId),
    queryFn: () => api<ExerciseHistory>(`/api/logs/exercises/${exerciseId}/history`),
  })

export const weekQuery = (planId: string) =>
  queryOptions({
    queryKey: trainingKeys.week(planId),
    queryFn: async (): Promise<PlanWeek> => completeWeek(await api<OlderWeek>(`/api/logs/plans/${planId}/week`)),
  })

/** Every write returns today's session (or null once it's empty): put it in the day's cache. */
function useSessionWrite<V>(dayId: string, write: (variables: V) => Promise<TrainingSession | null>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSuccess: (session) => {
      queryClient.setQueryData<DayLog>(trainingKeys.day(dayId), (log) => log && { ...log, session })
      return queryClient.invalidateQueries({ queryKey: trainingKeys.weeks })
    },
  })
}

export type NewSet = { exerciseId: string; weight: number; reps: number }

export const useLogSet = (dayId: string) =>
  useSessionWrite(dayId, ({ exerciseId, weight, reps }: NewSet) =>
    api<TrainingSession>(`/api/logs/exercises/${exerciseId}/sets`, {
      method: 'POST',
      body: { weight, reps },
    }),
  )

export const useUpdateSet = (dayId: string) =>
  useSessionWrite(dayId, ({ setId, weight, reps }: { setId: string; weight: number; reps: number }) =>
    api<TrainingSession>(`/api/logs/sets/${setId}`, { method: 'PATCH', body: { weight, reps } }),
  )

export const useDeleteSet = (dayId: string) =>
  useSessionWrite(dayId, (setId: string) =>
    api<TrainingSession | null>(`/api/logs/sets/${setId}`, { method: 'DELETE' }),
  )

export const useToggleDone = (dayId: string) =>
  useSessionWrite(dayId, ({ exerciseId, done }: { exerciseId: string; done: boolean }) =>
    api<TrainingSession | null>(`/api/logs/exercises/${exerciseId}/done`, {
      method: done ? 'PUT' : 'DELETE',
    }),
  )

/**
 * The whole workout done today in one go (or that taken back): every exercise still to do is
 * ticked and the session ends. A plain function, so a toast's "Anular" can call it after the
 * screen that marked it is gone.
 */
export async function setDayDone(queryClient: QueryClient, dayId: string, done: boolean) {
  const session = await api<TrainingSession | null>(`/api/logs/days/${dayId}/done`, {
    method: done ? 'PUT' : 'DELETE',
  })
  queryClient.setQueryData<DayLog>(trainingKeys.day(dayId), (log) => log && { ...log, session })
  await queryClient.invalidateQueries({ queryKey: trainingKeys.weeks })
  return session
}

export function useFinishSession(dayId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      api<SessionSummary>(`/api/logs/sessions/${sessionId}/finish`, { method: 'POST' }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trainingKeys.day(dayId) }),
        queryClient.invalidateQueries({ queryKey: trainingKeys.weeks }),
      ]),
  })
}
