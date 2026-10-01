import { WatchIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { SettingsGroup } from '@/features/settings/rows'
import { isIos } from '@/lib/platform'

import { healthQuery } from './api'
import { ProviderRow } from './sources-screen'
import type { Provider } from './sources'

// Garmin gives no access of its own: its app writes into each phone's health app.
const ROUTES = [
  { provider: 'health_connect', title: 'android', body: 'androidBody' },
  { provider: 'apple_health', title: 'iphone', body: 'iphoneBody' },
] as const satisfies ReadonlyArray<{ provider: Provider; title: string; body: string }>

/** Settings → Data sources → Garmin Connect: how a Garmin's data gets here, through the phone's
 * health app. */
export function GarminGuide() {
  const { t } = useTranslation()
  const sources = useQuery(healthQuery())
  // The phone in hand first.
  const routes = isIos() ? ROUTES.toReversed() : ROUTES
  return (
    <Page title={t('sources.garmin.name')} back="/settings/sources">
      {sources.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : sources.isError ? (
        <FormAlert messageKey={errorKey(sources.error)} />
      ) : (
        <div className="grid gap-6">
          <Card className="grid gap-3 p-5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-heart/15 text-heart">
              <WatchIcon weight="fill" className="size-6" aria-hidden />
            </span>
            <h2 className="text-lg">{t('sources.garmin.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('sources.garmin.body')}</p>
            <p className="text-sm text-muted-foreground">{t('sources.garmin.activity')}</p>
          </Card>
          {routes.map((route) => (
            <div key={route.provider} className="grid gap-2">
              <SettingsGroup title={t(`sources.garmin.${route.title}`)}>
                <ProviderRow sources={sources.data} provider={route.provider} />
              </SettingsGroup>
              <p className="px-1 text-xs text-muted-foreground">{t(`sources.garmin.${route.body}`)}</p>
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}
