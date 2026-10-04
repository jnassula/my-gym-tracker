import { createFileRoute } from '@tanstack/react-router'

import { ThemeScreen } from '@/features/settings/theme-screen'

export const Route = createFileRoute('/_app/settings/theme')({
  component: ThemeScreen,
})
