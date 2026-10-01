import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import type { Range } from '@/features/progress/types'
import { api } from '@/lib/api'

import type { BodyOverview, Measurement, NewMeasurement } from './types'

export const bodyKeys = {
  all: ['body'] as const,
  overview: (range: Range) => ['body', range] as const,
}

export const bodyQuery = (range: Range) =>
  queryOptions({
    queryKey: bodyKeys.overview(range),
    queryFn: () => api<BodyOverview>(`/api/body?range=${range}`),
    // Switching range keeps the previous chart on screen until the new one arrives.
    placeholderData: keepPreviousData,
  })

/** A weighing, typed in or read from the scale. Always kg. */
export function useAddMeasurement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (measurement: NewMeasurement) =>
      api<Measurement>('/api/body/measurements', { method: 'POST', body: measurement }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bodyKeys.all }),
  })
}

export function useDeleteMeasurement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/body/measurements/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bodyKeys.all }),
  })
}
