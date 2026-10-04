import { createFileRoute } from '@tanstack/react-router'

import { AccountScreen } from '@/features/settings/account-screen'

export const Route = createFileRoute('/_app/settings/account')({
  component: AccountScreen,
})
