import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

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
