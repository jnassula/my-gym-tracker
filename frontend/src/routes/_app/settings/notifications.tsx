import { createFileRoute } from '@tanstack/react-router'

import { NotificationsScreen } from '@/features/notifications/notifications-screen'

export const Route = createFileRoute('/_app/settings/notifications')({
  component: NotificationsScreen,
})
