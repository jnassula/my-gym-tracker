import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { bodyKeys } from '@/features/body/api'
import { progressKeys } from '@/features/progress/api'
import { api } from '@/lib/api'

import type { HealthSettings, HealthSources, Provider } from './sources'

/** The name the user gives the shortcut; "Sincronizar agora" runs it by this name. */
export const SHORTCUT_NAME = 'myGymTracker'

/** Opens the Shortcuts app and runs the shortcut (iPhone only). */
export const shortcutUrl = () => `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`

/** Where a source's bridge posts the samples: this app's own address. */
export const syncUrl = () => `${window.location.origin}/api/health/sync`

/** ngrok's free domains put a warning page in front of the API unless a header tells them not to. */
export const viaNgrok = () => /\.ngrok(-free)?\.(app|dev|io)$/.test(window.location.hostname)

export const healthKeys = { all: ['health'] as const }

export const healthQuery = () =>
  queryOptions({ queryKey: healthKeys.all, queryFn: () => api<HealthSources>('/api/health/connections') })

const connectionUrl = (provider: Provider) => `/api/health/connections/${provider}`

/** A new token for the source's bridge (shown once); connecting again replaces it. */
export function useConnectHealth(provider: Provider) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ token: string }>(connectionUrl(provider), { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: healthKeys.all }),
  })
}

/** Revokes the token and deletes everything the source sent. */
export function useDisconnectHealth(provider: Provider) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>(connectionUrl(provider), { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: healthKeys.all })
      await queryClient.invalidateQueries({ queryKey: progressKeys.all })
      await queryClient.invalidateQueries({ queryKey: bodyKeys.all })
    },
  })
}

const withSettings = (sources: HealthSources, provider: Provider, settings: Partial<HealthSettings>): HealthSources => ({
  ...sources,
  connections: sources.connections.map((connection) =>
    connection.provider === provider
      ? { ...connection, settings: { ...connection.settings, ...settings } }
      : connection,
  ),
})

/** Switches respond at once and go back if the server refuses. Only the changed fields are taken
 * from the reply, so a slow reply can't undo a newer switch. */
export function useUpdateHealthSettings(provider: Provider) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: Partial<HealthSettings>) =>
      api<HealthSettings>(`${connectionUrl(provider)}/settings`, { method: 'PATCH', body: changes }),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: healthKeys.all })
      const previous = queryClient.getQueryData<HealthSources>(healthKeys.all)
      if (previous) queryClient.setQueryData<HealthSources>(healthKeys.all, withSettings(previous, provider, changes))
      return { previous }
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(healthKeys.all, context.previous)
    },
    onSuccess: async (settings, changes) => {
      const changed = Object.fromEntries(
        Object.keys(changes).map((key) => [key, settings[key as keyof HealthSettings]]),
      )
      queryClient.setQueryData<HealthSources>(healthKeys.all, (data) => data && withSettings(data, provider, changed))
      // Turning a kind of data off deletes it: the sessions' figures and the weighings change.
      await queryClient.invalidateQueries({ queryKey: progressKeys.all })
      await queryClient.invalidateQueries({ queryKey: bodyKeys.all })
    },
  })
}
