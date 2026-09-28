import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { progressKeys } from '@/features/progress/api'
import { api } from '@/lib/api'

/** What the app keeps from the Health app ("O que lemos do relógio"). */
export type HealthSettings = { heart_rate: boolean; calories: boolean }

export type HealthStatus = {
  connected: boolean
  last_sync_at: string | null
  settings: HealthSettings
  /** This week (Monday to Sunday): sessions, and those with watch data. */
  week_sessions: number
  week_synced: number
}

/** The name the user gives the shortcut; "Sincronizar agora" runs it by this name. */
export const SHORTCUT_NAME = 'myGymTracker'

/** Opens the Shortcuts app and runs the shortcut (iPhone only). */
export const shortcutUrl = () => `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`

/** Where the shortcut posts the samples: this app's own address. */
export const syncUrl = () => `${window.location.origin}/api/health/sync`

export const healthKeys = { all: ['health'] as const }

export const healthQuery = () =>
  queryOptions({ queryKey: healthKeys.all, queryFn: () => api<HealthStatus>('/api/health') })

/** A new token for the shortcut (shown once); connecting again replaces it. */
export function useConnectHealth() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ token: string }>('/api/health/connection', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: healthKeys.all }),
  })
}

/** Revokes the token and deletes everything imported. */
export function useDisconnectHealth() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/api/health/connection', { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: healthKeys.all })
      await queryClient.invalidateQueries({ queryKey: progressKeys.all })
    },
  })
}

/** Switches respond at once and go back if the server refuses. Only the changed fields are taken
 * from the reply, so a slow reply can't undo a newer switch. */
export function useUpdateHealthSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: Partial<HealthSettings>) =>
      api<HealthSettings>('/api/health/settings', { method: 'PATCH', body: changes }),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: healthKeys.all })
      const previous = queryClient.getQueryData<HealthStatus>(healthKeys.all)
      if (previous) {
        queryClient.setQueryData<HealthStatus>(healthKeys.all, {
          ...previous,
          settings: { ...previous.settings, ...changes },
        })
      }
      return { previous }
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(healthKeys.all, context.previous)
    },
    onSuccess: async (settings, changes) => {
      const changed = Object.fromEntries(
        Object.keys(changes).map((key) => [key, settings[key as keyof HealthSettings]]),
      )
      queryClient.setQueryData<HealthStatus>(
        healthKeys.all,
        (data) => data && { ...data, settings: { ...data.settings, ...changed } },
      )
      // Turning a kind of data off deletes it: the sessions' figures change.
      await queryClient.invalidateQueries({ queryKey: progressKeys.all })
    },
  })
}
