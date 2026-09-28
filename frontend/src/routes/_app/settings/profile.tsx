import { createFileRoute } from '@tanstack/react-router'

import { ProfileScreen } from '@/features/settings/profile-screen'

export const Route = createFileRoute('/_app/settings/profile')({
  component: ProfileScreen,
})
