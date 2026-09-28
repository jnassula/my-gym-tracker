/// <reference lib="webworker" />
/**
 * The service worker (built by vite-plugin-pwa, injectManifest strategy): precaches the app
 * shell so it opens offline, serves index.html to every navigation, and lets a new version
 * take over when the user accepts the update. Push notifications are handled in ./push.ts.
 */
import './push'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// A single-page app: any URL opens index.html (offline too). The API is never cached.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//, /^\/health/] }),
)

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting()
})
