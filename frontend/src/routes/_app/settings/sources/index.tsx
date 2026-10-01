import { createFileRoute } from '@tanstack/react-router'

import { SourcesScreen } from '@/features/health/sources-screen'

export const Route = createFileRoute('/_app/settings/sources/')({
  component: SourcesScreen,
})
