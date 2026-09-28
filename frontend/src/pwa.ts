import { toast } from 'sonner'
import { registerSW } from 'virtual:pwa-register'

import i18n from '@/i18n'

/** Registers the service worker. A new version is offered, never forced (not mid-workout). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  const update = registerSW({
    onNeedRefresh() {
      toast(i18n.t('pwa.updateAvailable'), {
        duration: Infinity,
        action: { label: i18n.t('pwa.update'), onClick: () => void update(true) },
      })
    },
  })
}
