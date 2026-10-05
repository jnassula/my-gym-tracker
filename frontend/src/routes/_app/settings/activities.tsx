import { createFileRoute } from '@tanstack/react-router'

import { ActivitiesScreen } from '@/features/activities/activities-screen'

export const Route = createFileRoute('/_app/settings/activities')({
  component: ActivitiesScreen,
})
