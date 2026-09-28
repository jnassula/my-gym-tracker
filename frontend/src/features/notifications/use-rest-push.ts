import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { restTimer } from '@/features/training/rest-timer'

import { cancelRestPush, notificationsQuery, scheduleRestPush } from './api'
import { hasPushDevice } from './push'

/**
 * "Fim do descanso" outside the app. While the app is visible its own timer vibrates and beeps;
 * when it goes to the background mid-rest, the server is asked to push at the end, and asked
 * to cancel when the app comes back. A visible app never gets a system notification for it.
 */
export function useRestPush() {
  const notifications = useQuery(notificationsQuery())
  const enabled = notifications.data?.settings.rest_end ?? true

  useEffect(() => restTimer.setAlerts(enabled), [enabled])

  useEffect(() => {
    let scheduled = false
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const { endsAt } = restTimer.get()
        if (enabled && hasPushDevice() && endsAt !== null && endsAt > Date.now()) {
          scheduled = true
          scheduleRestPush(endsAt).catch(() => (scheduled = false))
        }
      } else if (scheduled) {
        scheduled = false
        void cancelRestPush().catch(() => undefined)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled])
}
