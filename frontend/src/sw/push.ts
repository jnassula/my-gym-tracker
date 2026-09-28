/// <reference lib="webworker" />
/** Web Push: show what the backend sends, and open the app where it points when tapped. */

declare let self: ServiceWorkerGlobalScope

type Payload = { title: string; body: string; url?: string; tag?: string | null }

self.addEventListener('push', (event) => {
  const payload = event.data?.json() as Payload | undefined
  if (!payload) return
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Same tag: the newer notification replaces the older one.
      tag: payload.tag ?? undefined,
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        await open.navigate(url)
      } else {
        await self.clients.openWindow(url)
      }
    })(),
  )
})
