import { createFileRoute } from '@tanstack/react-router'

import { TimeZoneScreen } from '@/features/settings/timezone-screen'

export const Route = createFileRoute('/_app/settings/timezone')({
  component: TimeZoneScreen,
})
