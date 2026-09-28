import { CaretRightIcon, LockKeyIcon, SignOutIcon } from '@phosphor-icons/react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Page } from '@/components/app-shell/page'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { logout } from '@/features/auth/api'
import { errorKey } from '@/features/auth/errors'
import { useRequiredSession } from '@/lib/auth'

export const Route = createFileRoute('/_app/settings/')({
  component: Settings,
})

function Settings() {
  const { t } = useTranslation()
  const { user } = useRequiredSession()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  const onLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch (error) {
      // The session is forgotten locally either way; just tell the user.
      toast.error(t(errorKey(error)))
    }
    await navigate({ to: '/login' })
  }

  return (
    <Page title={t('settings.title')}>
      <div className="grid gap-6">
        <Card className="flex-row items-center gap-3.5 px-4">
          <Avatar className="size-14">
            <AvatarFallback className="bg-accent text-xl text-accent-foreground">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-medium">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </Card>

        <section className="grid gap-2">
          <h2 className="px-1 text-xs tracking-widest text-primary uppercase">
            {t('settings.account')}
          </h2>
          <Card className="py-0">
            <Link
              to="/settings/password"
              className="flex min-h-14 items-center gap-3 px-4 text-sm hover:bg-accent/50"
            >
              <LockKeyIcon className="size-5 text-muted-foreground" />
              <span className="flex-1">{t('settings.changePassword')}</span>
              <CaretRightIcon className="size-4 text-muted-foreground" />
            </Link>
          </Card>
        </section>

        <Button variant="destructive" size="touch" disabled={loggingOut} onClick={() => void onLogout()}>
          {loggingOut ? <Spinner /> : <SignOutIcon />}
          {t('settings.logout')}
        </Button>
      </div>
    </Page>
  )
}
