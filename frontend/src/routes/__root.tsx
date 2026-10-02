import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

import { Toaster } from '@/components/ui/sonner'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <Outlet />
      {/* Under the phone's status bar in the installed app, plus a margin (sonner's own default). */}
      <Toaster
        position="top-center"
        offset={{ top: 'calc(env(safe-area-inset-top) + 24px)' }}
        mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 16px)' }}
      />
    </>
  ),
})
