import { createFileRoute } from '@tanstack/react-router'

import { OverviewScreen } from '@/features/progress/overview-screen'

export const Route = createFileRoute('/_app/progress/')({
  component: OverviewScreen,
})
