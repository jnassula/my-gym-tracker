import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

import type { Library } from './builder/library'
import type { ImportPreview, Plan, PlanCreate, PlanSummary } from './types'

export const MAX_PDF_BYTES = 20 * 1024 * 1024

export const workoutKeys = {
  all: ['workouts'] as const,
  detail: (id: string) => ['workouts', id] as const,
}

export const plansQuery = () =>
  queryOptions({ queryKey: workoutKeys.all, queryFn: () => api<PlanSummary[]>('/api/workouts') })

export const planQuery = (id: string) =>
  queryOptions({ queryKey: workoutKeys.detail(id), queryFn: () => api<Plan>(`/api/workouts/${id}`) })

export function importPdf(file: File) {
  const form = new FormData()
  form.append('file', file)
  return api<ImportPreview>('/api/workouts/import', { method: 'POST', body: form })
}

export function discardUpload(fileId: string) {
  return api<void>(`/api/files/${fileId}`, { method: 'DELETE' })
}

export function useCreatePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PlanCreate) => api<Plan>('/api/workouts', { method: 'POST', body }),
    onSuccess: (plan) => {
      queryClient.setQueryData(workoutKeys.detail(plan.id), plan)
      return queryClient.invalidateQueries({ queryKey: workoutKeys.all, exact: true })
    },
  })
}

export function useUpdatePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; name?: string; is_active?: boolean }) =>
      api<Plan>(`/api/workouts/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: (plan) => {
      queryClient.setQueryData(workoutKeys.detail(plan.id), plan)
      // The active plan drives Hoje, the week and progress.
      return queryClient.invalidateQueries()
    },
  })
}

export function useDeletePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/workouts/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: workoutKeys.detail(id) })
      return queryClient.invalidateQueries()
    },
  })
}

/** "Ver PDF": fetches it with the session and opens it in a new tab. */
export async function openFile(fileId: string) {
  // Opened before the request, so the browser counts it as a direct result of the tap.
  const tab = window.open('', '_blank')
  try {
    const blob = await api<Blob>(`/api/files/${fileId}/content`, { responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    if (tab) tab.location.href = url
    else window.location.href = url
    // Long enough for the viewer to load it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    tab?.close()
    throw error
  }
}

/** Exercises to pick from in the plan builder: the user's own, then the base list. */
export const libraryQuery = () =>
  queryOptions({
    queryKey: ['exercises', 'library'] as const,
    queryFn: () => api<Library>('/api/exercises/library'),
    staleTime: 5 * 60 * 1000,
  })
