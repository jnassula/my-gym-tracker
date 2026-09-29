import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { AdminShell } from '@/features/admin/admin-shell'
import { ensureSession } from '@/lib/auth'

/**
 * The backoffice, for the accounts in ADMIN_EMAILS. The guard only keeps everyone else off the
 * screens: the API refuses them whatever the browser says.
 */
export const Route = createFileRoute('/_admin')({
  beforeLoad: async ({ location }) => {
    const session = await ensureSession()
    if (!session) throw redirect({ to: '/login', search: { redirect: location.href } })
    if (!session.user.is_admin) throw redirect({ to: '/' })
  },
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
})
