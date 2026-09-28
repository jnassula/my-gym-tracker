import { WarningCircleIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { checkResetToken } from '@/features/auth/api'
import { AuthScreen } from '@/features/auth/auth-screen'
import { ResetPasswordForm } from '@/features/auth/reset-password-form'
import { cn } from '@/lib/utils'

/** Deep link from the email. Not guest-only: the link must work even when signed in. */
export const Route = createFileRoute('/reset-password')({
  component: ResetPassword,
})

function ResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // The token travels in the fragment (#token=…) so it never reaches server logs.
  const token = useLocation({
    select: (location) => new URLSearchParams(location.hash.replace(/^#/, '')).get('token'),
  })
  const check = useQuery({
    queryKey: ['reset-token', token],
    queryFn: () => checkResetToken(token!),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
  })

  if (token && check.isPending) {
    return (
      <AuthScreen title={t('auth.reset.title')} subtitle={t('auth.reset.checking')}>
        <Spinner className="size-6 text-muted-foreground" />
      </AuthScreen>
    )
  }

  if (!token || check.isError) {
    return (
      <AuthScreen title={t('auth.reset.title')}>
        <div className="grid gap-3.5">
          <Alert variant="destructive">
            <WarningCircleIcon />
            <AlertTitle>{t('auth.reset.invalidTitle')}</AlertTitle>
            <AlertDescription>{t('auth.reset.invalidBody')}</AlertDescription>
          </Alert>
          <Link to="/forgot-password" className={cn(buttonVariants({ variant: 'outline-primary', size: 'hero' }))}>
            {t('auth.reset.requestNew')}
          </Link>
        </div>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen title={t('auth.reset.title')} subtitle={t('auth.reset.for', { email: check.data?.email })}>
      <ResetPasswordForm token={token} onSuccess={() => void navigate({ to: '/', hash: '' })} />
    </AuthScreen>
  )
}
