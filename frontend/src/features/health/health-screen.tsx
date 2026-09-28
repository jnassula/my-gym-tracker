import { HeartIcon, InfoIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Page } from '@/components/app-shell/page'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { SettingsGroup, SwitchRow } from '@/features/settings/rows'
import { cn } from '@/lib/utils'

import {
  healthQuery,
  shortcutUrl,
  useConnectHealth,
  useDisconnectHealth,
  useUpdateHealthSettings,
  type HealthSettings,
  type HealthStatus,
} from './api'
import { formatRelative } from './format'
import { ShortcutSetup } from './shortcut-setup'

/** Settings → Apple Health: the shortcut's status and token, and what the app keeps. */
export function HealthScreen() {
  const { t } = useTranslation()
  const status = useQuery(healthQuery())
  const connect = useConnectHealth()
  // The token is shown once, right after connecting (or replacing it).
  const [token, setToken] = useState<string | null>(null)
  const newToken = () =>
    connect.mutate(undefined, {
      onSuccess: (data) => setToken(data.token),
      onError: (error) => toast.error(t(errorKey(error))),
    })

  return (
    <Page title="Apple Health" back="/settings">
      {status.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : status.isError ? (
        <FormAlert messageKey={errorKey(status.error)} />
      ) : token ? (
        <ShortcutSetup token={token} onDone={() => setToken(null)} />
      ) : status.data.connected ? (
        <Connected status={status.data} onNewToken={newToken} busy={connect.isPending} />
      ) : (
        <div className="grid gap-6">
          <Card className="grid gap-3 p-5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-heart/15 text-heart">
              <HeartIcon weight="fill" className="size-6" aria-hidden />
            </span>
            <h2 className="text-lg">{t('health.intro.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('health.intro.body')}</p>
            <p className="text-sm text-muted-foreground">{t('health.intro.privacy')}</p>
            <Button size="hero" disabled={connect.isPending} onClick={newToken}>
              {t('health.connect')}
            </Button>
          </Card>
          <WebLimitation />
        </div>
      )}
    </Page>
  )
}

function WebLimitation() {
  const { t } = useTranslation()
  return (
    <Alert>
      <InfoIcon aria-hidden />
      <AlertDescription>{t('health.webLimitation')}</AlertDescription>
    </Alert>
  )
}

function Connected({ status, onNewToken, busy }: { status: HealthStatus; onNewToken: () => void; busy: boolean }) {
  const { t, i18n } = useTranslation()
  const [confirm, setConfirm] = useState<'token' | 'disconnect' | null>(null)
  const disconnect = useDisconnectHealth()
  const lastSync = status.last_sync_at
    ? t('health.lastSync', { when: formatRelative(status.last_sync_at, i18n.language) })
    : t('health.waiting')

  return (
    <div className="grid gap-6">
      <Card className="grid gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-heart/15 text-heart">
            <HeartIcon weight="fill" className="size-5" aria-hidden />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className="font-medium">{t('health.connected')}</p>
            <p className="text-[13px] text-muted-foreground">{lastSync}</p>
          </div>
        </div>
        {status.week_sessions > 0 && (
          <Progress
            value={(status.week_synced / status.week_sessions) * 100}
            aria-label={t('health.weekSynced', { synced: status.week_synced, total: status.week_sessions })}
          >
            <span className="text-[13px] text-muted-foreground">
              {t('health.weekSynced', { synced: status.week_synced, total: status.week_sessions })}
            </span>
          </Progress>
        )}
        <a href={shortcutUrl()} className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }))}>
          {t('health.syncNow')}
        </a>
      </Card>

      <ReadSettings settings={status.settings} />
      <WebLimitation />

      <div className="grid gap-2">
        <Button variant="outline" size="touch" disabled={busy} onClick={() => setConfirm('token')}>
          {t('health.newToken')}
        </Button>
        <Button
          variant="outline"
          size="touch"
          className="text-destructive"
          disabled={disconnect.isPending}
          onClick={() => setConfirm('disconnect')}
        >
          {t('health.disconnect')}
        </Button>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'token' ? t('health.newTokenTitle') : t('health.disconnectTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'token' ? t('health.newTokenBody') : t('health.disconnectBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="grid grid-cols-2 gap-2">
            <AlertDialogCancel variant="outline" size="touch">
              {t('health.cancel')}
            </AlertDialogCancel>
            <Button
              variant={confirm === 'token' ? 'outline-primary' : 'destructive'}
              size="touch"
              onClick={() => {
                if (confirm === 'token') onNewToken()
                else
                  disconnect.mutate(undefined, {
                    onSuccess: () => toast.success(t('health.disconnected')),
                    onError: (error) => toast.error(t(errorKey(error))),
                  })
                setConfirm(null)
              }}
            >
              {confirm === 'token' ? t('health.newTokenConfirm') : t('health.disconnectConfirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ReadSettings({ settings }: { settings: HealthSettings }) {
  const { t } = useTranslation()
  const update = useUpdateHealthSettings()
  const save = (changes: Partial<HealthSettings>) =>
    update.mutate(changes, { onError: () => toast.error(t('settings.saveError')) })
  return (
    <div className="grid gap-2">
      <SettingsGroup title={t('health.reads')}>
        <SwitchRow
          label={t('health.heartRate')}
          hint={t('health.heartRateHint')}
          checked={settings.heart_rate}
          onCheckedChange={(on) => save({ heart_rate: on })}
        />
        <SwitchRow
          label={t('health.calories')}
          hint={t('health.caloriesHint')}
          checked={settings.calories}
          onCheckedChange={(on) => save({ calories: on })}
        />
      </SettingsGroup>
      <p className="px-1 text-xs text-muted-foreground">{t('health.readsFooter')}</p>
    </div>
  )
}
