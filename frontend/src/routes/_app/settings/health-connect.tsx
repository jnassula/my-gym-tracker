import { createFileRoute } from '@tanstack/react-router'

import { HealthScreen } from '@/features/health/health-screen'

export const Route = createFileRoute('/_app/settings/health-connect')({
  component: () => <HealthScreen provider="health_connect" />,
})
