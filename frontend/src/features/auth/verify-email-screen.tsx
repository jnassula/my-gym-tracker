import { WarningCircleIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { verifyEmail } from './api'
import { AuthScreen } from './auth-screen'
import { cn } from '@/lib/utils'

/** Where the link of the confirmation email lands: it confirms the account and signs in. */
export function VerifyEmailScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // The token travels in the fragment (#token=…) so it never reaches server logs.
  const token = useLocation({
    select: (location) => new URLSearchParams(location.hash.replace(/^#/, '')).get('token'),
  })
  // A query, so the link is used once however often the screen renders: it works only once.
  const confirmed = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => verifyEmail(token!),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  useEffect(() => {
    if (confirmed.isSuccess) void navigate({ to: '/', hash: '' })
  }, [confirmed.isSuccess, navigate])

  if (token && !confirmed.isError) {
    return (
      <AuthScreen title={t('auth.verify.title')} subtitle={t('auth.verify.checking')}>
        <Spinner className="size-6 text-muted-foreground" />
      </AuthScreen>
    )
  }

  return (
    <AuthScreen title={t('auth.verify.title')}>
      <div className="grid gap-3.5">
        <Alert variant="destructive">
          <WarningCircleIcon />
          <AlertTitle>{t('auth.verify.invalidTitle')}</AlertTitle>
          <AlertDescription>{t('auth.verify.invalidBody')}</AlertDescription>
        </Alert>
        <Link to="/login" className={cn(buttonVariants({ variant: 'outline-primary', size: 'hero' }))}>
          {t('auth.verify.login')}
        </Link>
      </div>
    </AuthScreen>
  )
}
