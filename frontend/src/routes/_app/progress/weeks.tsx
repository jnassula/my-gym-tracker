import { createFileRoute } from '@tanstack/react-router'

import { WeeksScreen } from '@/features/progress/weeks-screen'

export const Route = createFileRoute('/_app/progress/weeks')({
  component: WeeksScreen,
})
