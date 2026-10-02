import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { BottomTabs } from '@/components/app-shell/bottom-tabs'
import { useRestPush } from '@/features/notifications/use-rest-push'
import { ensureSession } from '@/lib/auth'

/** Everything behind sign-in. Unauthenticated visits land on welcome (or login + redirect). */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    if (await ensureSession()) return
    if (location.pathname === '/') throw redirect({ to: '/welcome' })
    throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  component: AppLayout,
})

function AppLayout() {
  useRestPush()
  // The bar is 4.25rem tall and its "+" button rises 1.25rem above it.
  return (
    <div className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <Outlet />
      <BottomTabs />
    </div>
  )
}
