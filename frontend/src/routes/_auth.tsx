import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { ensureSession } from '@/lib/auth'

/** Guest-only screens (welcome, login, sign-up, forgot password). */
export const Route = createFileRoute('/_auth')({
  beforeLoad: async () => {
    if (await ensureSession()) throw redirect({ to: '/' })
  },
  component: Outlet,
})
