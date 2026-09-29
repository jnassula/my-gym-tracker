import { createFileRoute } from '@tanstack/react-router'

import { UsersScreen } from '@/features/admin/users-screen'

export const Route = createFileRoute('/_admin/admin/users')({
  component: UsersScreen,
})
