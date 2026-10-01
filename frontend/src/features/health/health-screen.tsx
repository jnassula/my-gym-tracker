import { AndroidLogoIcon, HeartIcon, InfoIcon, type Icon } from '@phosphor-icons/react'
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
import { isIos } from '@/lib/platform'
import { cn } from '@/lib/utils'

import { healthQuery, shortcutUrl, useConnectHealth, useDisconnectHealth, useUpdateHealthSettings } from './api'
import { formatRelative } from './format'
import { HealthConnectSetup } from './health-connect-setup'
import { ShortcutSetup } from './shortcut-setup'
import { connectionOf, type Connection, type HealthSettings, type HealthSources, type Provider } from './sources'

const ICONS: Record<Provider, Icon> = { apple_health: HeartIcon, health_connect: AndroidLogoIcon }
// How each source's bridge is set up, shown with the token.
const SETUPS = { apple_health: ShortcutSetup, health_connect: HealthConnectSetup } satisfies Record<Provider, unknown>

/** Settings → Data sources → one source: its bridge's status and token, and what the app keeps. */
export function HealthScreen({ provider }: { provider: Provider }) {
  const { t } = useTranslation()
  const sources = useQuery(healthQuery())
  const connect = useConnectHealth(provider)
  // The token is shown once, right after connecting (or replacing it).
  const [token, setToken] = useState<string | null>(null)
  const newToken = () =>
    connect.mutate(undefined, {
      onSuccess: (data) => setToken(data.token),
      onError: (error) => toast.error(t(errorKey(error))),
    })
  const name = t(`sources.providers.${provider}.name`)
  const Setup = SETUPS[provider]
  const ProviderIcon = ICONS[provider]

  return (
    <Page title={name} back="/settings/sources">
      {sources.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : sources.isError ? (
        <FormAlert messageKey={errorKey(sources.error)} />
      ) : token ? (
        <Setup token={token} onDone={() => setToken(null)} />
      ) : connectionOf(sources.data, provider).connected ? (
        <Connected
          sources={sources.data}
          connection={connectionOf(sources.data, provider)}
          onNewToken={newToken}
          busy={connect.isPending}
        />
      ) : (
        <div className="grid gap-6">
          <Card className="grid gap-3 p-5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-heart/15 text-heart">
              <ProviderIcon weight="fill" className="size-6" aria-hidden />
            </span>
            <h2 className="text-lg">{t(`sources.providers.${provider}.introTitle`)}</h2>
            <p className="text-sm text-muted-foreground">{t(`sources.providers.${provider}.introBody`)}</p>
            <p className="text-sm text-muted-foreground">{t(`sources.providers.${provider}.privacy`)}</p>
            <Button size="hero" disabled={connect.isPending} onClick={newToken}>
              {t('health.connect', { name })}
            </Button>
          </Card>
          <WebLimitation provider={provider} />
        </div>
      )}
    </Page>
  )
}

function WebLimitation({ provider }: { provider: Provider }) {
  const { t } = useTranslation()
  return (
    <Alert>
      <InfoIcon aria-hidden />
      <AlertDescription>{t(`sources.providers.${provider}.limitation`)}</AlertDescription>
    </Alert>
  )
}

type ConnectedProps = { sources: HealthSources; connection: Connection; onNewToken: () => void; busy: boolean }

function Connected({ sources, connection, onNewToken, busy }: ConnectedProps) {
  const { t, i18n } = useTranslation()
  const [confirm, setConfirm] = useState<'token' | 'disconnect' | null>(null)
  const { provider } = connection
  const disconnect = useDisconnectHealth(provider)
  const name = t(`sources.providers.${provider}.name`)
  const ProviderIcon = ICONS[provider]
  const lastSync = connection.last_sync_at
    ? t('health.lastSync', { when: formatRelative(connection.last_sync_at, i18n.language) })
    : t('health.waiting')

  return (
    <div className="grid gap-6">
      <Card className="grid gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-heart/15 text-heart">
            <ProviderIcon weight="fill" className="size-5" aria-hidden />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className="font-medium">{t('health.connected')}</p>
            <p className="text-[13px] text-muted-foreground">{lastSync}</p>
          </div>
        </div>
        {sources.week_sessions > 0 && (
          <Progress
            value={(sources.week_synced / sources.week_sessions) * 100}
            aria-label={t('health.weekSynced', { synced: sources.week_synced, total: sources.week_sessions })}
          >
            <span className="text-[13px] text-muted-foreground">
              {t('health.weekSynced', { synced: sources.week_synced, total: sources.week_sessions })}
            </span>
          </Progress>
        )}
        {provider === 'health_connect' ? (
          <p className="text-[13px] text-muted-foreground">{t('health.hc.syncsItself')}</p>
        ) : (
          // The shortcut only exists on the iPhone it was built on.
          isIos() && (
            <a href={shortcutUrl()} className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }))}>
              {t('health.syncNow')}
            </a>
          )
        )}
      </Card>

      <ReadSettings provider={provider} settings={connection.settings} />
      <WebLimitation provider={provider} />

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
          {t('health.disconnect', { name })}
        </Button>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'token' ? t('health.newTokenTitle') : t('health.disconnectTitle', { name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'token' ? t('health.newTokenBody') : t('health.disconnectBody', { name })}
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
                    onSuccess: () => toast.success(t('health.disconnected', { name })),
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

function ReadSettings({ provider, settings }: { provider: Provider; settings: HealthSettings }) {
  const { t } = useTranslation()
  const update = useUpdateHealthSettings(provider)
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
