import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'

import { Spinner } from '@/components/ui/spinner'
import { releaseAvatars } from '@/features/settings/api'
import { sessionStore } from '@/lib/auth'

import { routeTree } from './routeTree.gen'

export const queryClient = new QueryClient()

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultPendingComponent: () => (
    <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
      <Spinner className="size-6" />
    </div>
  ),
})

// Losing the session (logout, refresh failure) re-runs the route guards, which redirect.
sessionStore.subscribe(() => {
  if (!sessionStore.get()) {
    releaseAvatars(queryClient)
    queryClient.clear()
    void router.invalidate()
  }
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
