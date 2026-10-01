import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { LinkRow, SettingsGroup, SettingsRow } from '@/features/settings/rows'

import { healthQuery } from './api'
import { connectionOf, PROVIDER_ROUTE, PROVIDERS, type HealthSources, type Provider } from './sources'

/** Settings → Data sources: where the workouts' heart rate and calories come from. */
export function SourcesScreen() {
  const { t } = useTranslation()
  const sources = useQuery(healthQuery())
  return (
    <Page title={t('sources.title')} back="/settings">
      {sources.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : sources.isError ? (
        <FormAlert messageKey={errorKey(sources.error)} />
      ) : (
        <div className="grid gap-6">
          <p className="text-sm text-muted-foreground">{t('sources.intro')}</p>
          <SettingsGroup title={t('sources.apps')}>
            {PROVIDERS.map((provider) => (
              <ProviderRow key={provider} sources={sources.data} provider={provider} />
            ))}
          </SettingsGroup>
          <SettingsGroup title={t('sources.services')}>
            <LinkRow to="/settings/sources/garmin" label={t('sources.garmin.name')} hint={t('sources.garmin.hint')} />
            <SettingsRow label={t('sources.strava.name')} hint={t('sources.strava.hint')}>
              <Badge variant="secondary">{t('sources.soon')}</Badge>
            </SettingsRow>
          </SettingsGroup>
          <SettingsGroup title={t('sources.scales')}>
            <LinkRow to="/progress/body" label={t('sources.scale.name')} hint={t('sources.scale.hint')} />
          </SettingsGroup>
        </div>
      )}
    </Page>
  )
}

/** A source that connects here, with whether it is connected. */
export function ProviderRow({ sources, provider }: { sources: HealthSources; provider: Provider }) {
  const { t } = useTranslation()
  return (
    <LinkRow
      to={PROVIDER_ROUTE[provider]}
      label={t(`sources.providers.${provider}.name`)}
      hint={t(`sources.providers.${provider}.hint`)}
      value={
        connectionOf(sources, provider).connected ? (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            {t('health.connected')}
          </span>
        ) : (
          t('health.notConnected')
        )
      }
    />
  )
}
