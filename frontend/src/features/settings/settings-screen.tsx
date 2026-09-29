import { CaretRightIcon, SignOutIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Page } from '@/components/app-shell/page'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { logout } from '@/features/auth/api'
import { errorKey } from '@/features/auth/errors'
import { healthQuery } from '@/features/health/api'
import { useUpdateMe, type UserChanges } from '@/features/settings/api'
import { LinkRow, Segmented, SettingsGroup, SettingsRow, SwitchRow } from '@/features/settings/rows'
import { plansQuery } from '@/features/workouts/api'
import { LANGUAGES } from '@/i18n'
import { useRequiredSession } from '@/lib/auth'

export function SettingsScreen() {
  const { t } = useTranslation()
  const { user } = useRequiredSession()
  const navigate = useNavigate()
  const update = useUpdateMe()
  const { resolvedTheme, setTheme } = useTheme()
  const plans = useQuery(plansQuery())
  const health = useQuery(healthQuery())
  const [loggingOut, setLoggingOut] = useState(false)

  const save = (changes: UserChanges) =>
    update.mutate(changes, { onError: () => toast.error(t('settings.saveError')) })

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
        <Link
          to="/settings/profile"
          aria-label={t('settings.profileLink', { name: user.name })}
          className="flex items-center gap-3.5 rounded-2xl bg-card p-3.5"
        >
          <Avatar className="size-11">
            <AvatarFallback className="bg-accent text-lg text-accent-foreground">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
          <CaretRightIcon aria-hidden className="size-4 text-muted-foreground" />
        </Link>

        <SettingsGroup title={t('settings.preferences')}>
          <SettingsRow label={t('settings.language')}>
            <Segmented
              label={t('settings.language')}
              value={user.language}
              options={LANGUAGES.map((language) => ({ value: language, label: language.toUpperCase() }))}
              onChange={(language) => save({ language })}
            />
          </SettingsRow>
          <SettingsRow label={t('settings.units')}>
            <Segmented
              label={t('settings.units')}
              value={user.unit}
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
              onChange={(unit) => save({ unit })}
            />
          </SettingsRow>
          <SwitchRow
            label={t('settings.darkTheme')}
            checked={resolvedTheme !== 'light'}
            onCheckedChange={(dark) => setTheme(dark ? 'dark' : 'light')}
          />
          <SwitchRow
            label={t('settings.autoRest')}
            hint={t('settings.autoRestHint')}
            checked={user.auto_rest}
            onCheckedChange={(autoRest) => save({ auto_rest: autoRest })}
          />
          <LinkRow to="/settings/timezone" label={t('settings.timezone')} value={user.timezone} />
        </SettingsGroup>

        <SettingsGroup title={t('settings.data')}>
          <LinkRow
            to="/settings/health"
            label="Apple Health"
            value={
              health.data &&
              (health.data.connected ? (
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                  {t('health.connected')}
                </span>
              ) : (
                t('health.notConnected')
              ))
            }
          />
          <LinkRow to="/settings/pdfs" label={t('settings.pdfs')} value={plans.data?.length} />
          <LinkRow to="/settings/notifications" label={t('settings.notifications')} />
        </SettingsGroup>

        {user.is_admin && (
          <SettingsGroup title={t('settings.administration')}>
            <LinkRow to="/admin" label={t('admin.title')} />
          </SettingsGroup>
        )}

        <Button
          variant="outline"
          size="touch"
          className="text-destructive"
          disabled={loggingOut}
          onClick={() => void onLogout()}
        >
          {loggingOut ? <Spinner /> : <SignOutIcon />}
          {t('settings.logout')}
        </Button>
      </div>
    </Page>
  )
}
