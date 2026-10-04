import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

import { currentSubscription, subscribeDevice, unsubscribeDevice } from './push'

export type NotificationSettings = {
  training_reminder: boolean
  /** "17:30:00", the user's local time. */
  reminder_time: string
  rest_end: boolean
  weekly_summary: boolean
  new_record: boolean
  plan_expiring: boolean
}

export type Notifications = {
  /** The server's VAPID key; null when push isn't configured there. */
  public_key: string | null
  settings: NotificationSettings
}

export const notificationKeys = {
  all: ['notifications'] as const,
  device: ['notifications', 'device'] as const,
}

export const notificationsQuery = () =>
  queryOptions({ queryKey: notificationKeys.all, queryFn: () => api<Notifications>('/api/notifications') })

/** Whether this browser is subscribed (asks the push manager, not the server). */
export const deviceQuery = () =>
  queryOptions({ queryKey: notificationKeys.device, queryFn: async () => Boolean(await currentSubscription()) })

/** Switches respond at once and go back if the server refuses. */
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: Partial<NotificationSettings>) =>
      api<NotificationSettings>('/api/notifications/settings', { method: 'PATCH', body: changes }),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all })
      const previous = queryClient.getQueryData<Notifications>(notificationKeys.all)
      if (previous) {
        queryClient.setQueryData<Notifications>(notificationKeys.all, {
          ...previous,
          settings: { ...previous.settings, ...changes },
        })
      }
      return { previous }
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(notificationKeys.all, context.previous)
    },
    onSuccess: (settings) =>
      queryClient.setQueryData<Notifications>(notificationKeys.all, (data) => data && { ...data, settings }),
  })
}

/** Returns false when the user refused the permission prompt. */
export function useEnableDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (publicKey: string) => {
      const subscription = await subscribeDevice(publicKey)
      if (!subscription) return false
      await api<void>('/api/notifications/subscriptions', { method: 'POST', body: subscription })
      return true
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.device }),
  })
}

/** This browser stops receiving the account's notifications, here and on the server. */
export async function disableDevice() {
  const endpoint = await unsubscribeDevice()
  if (endpoint) {
    const query = new URLSearchParams({ endpoint })
    await api<void>(`/api/notifications/subscriptions?${query}`, { method: 'DELETE' })
  }
}

export function useDisableDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: disableDevice,
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.device }),
  })
}

export const sendTestNotification = () => api<{ sent: number }>('/api/notifications/test', { method: 'POST' })

/** The app went to the background mid-rest: the server notifies when it ends. */
export const scheduleRestPush = (endsAt: number) =>
  api<void>('/api/notifications/rest', {
    method: 'POST',
    body: { ends_at: new Date(endsAt).toISOString() },
    keepalive: true,
  })

export const cancelRestPush = () => api<void>('/api/notifications/rest', { method: 'DELETE', keepalive: true })
