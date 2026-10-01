import { createFileRoute } from '@tanstack/react-router'

import { GarminGuide } from '@/features/health/garmin-guide'

export const Route = createFileRoute('/_app/settings/sources/garmin')({
  component: GarminGuide,
})
