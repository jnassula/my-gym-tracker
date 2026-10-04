import { createFileRoute } from '@tanstack/react-router'

import { VerifyEmailScreen } from '@/features/auth/verify-email-screen'

/** Deep link from the confirmation email. Not guest-only: it must work in any browser. */
export const Route = createFileRoute('/verify-email')({
  component: VerifyEmailScreen,
})
