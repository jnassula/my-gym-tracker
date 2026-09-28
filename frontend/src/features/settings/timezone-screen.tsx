import { CheckIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Page } from '@/components/app-shell/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUpdateMe } from '@/features/settings/api'
import { useRequiredSession } from '@/lib/auth'

const readable = (zone: string) => zone.replaceAll('_', ' ')

/** Fuso horário: where "today" starts and ends for the workout log. */
export function TimeZoneScreen() {
  const { t } = useTranslation()
  const { user } = useRequiredSession()
  const navigate = useNavigate()
  const update = useUpdateMe()
  const [search, setSearch] = useState('')
  const zones = useMemo(() => Intl.supportedValuesOf('timeZone'), [])
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone
  const query = search.trim().toLowerCase()
  const shown = query ? zones.filter((zone) => readable(zone).toLowerCase().includes(query)) : zones

  const choose = (timezone: string) =>
    update.mutate(
      { timezone },
      {
        onSuccess: () => void navigate({ to: '/settings' }),
        onError: () => toast.error(t('settings.saveError')),
      },
    )

  return (
    <Page title={t('settings.timezonePage.title')} back="/settings">
      <div className="grid gap-3">
        <Input
          type="search"
          value={search}
          placeholder={t('settings.timezonePage.search')}
          aria-label={t('settings.timezonePage.search')}
          onChange={(event) => setSearch(event.target.value)}
        />
        {device && device !== user.timezone && (
          <Button variant="outline-primary" size="touch" disabled={update.isPending} onClick={() => choose(device)}>
            {t('settings.timezonePage.device', { zone: readable(device) })}
          </Button>
        )}
        {shown.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">{t('settings.timezonePage.none')}</p>
        ) : (
          <ul className="grid divide-y rounded-2xl bg-card">
            {shown.map((zone) => {
              const current = zone === user.timezone
              return (
                <li key={zone}>
                  <button
                    type="button"
                    aria-current={current || undefined}
                    disabled={update.isPending}
                    onClick={() => !current && choose(zone)}
                    className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px]"
                  >
                    <span className="flex-1">{readable(zone)}</span>
                    {current && (
                      <>
                        <span className="sr-only">{t('settings.timezonePage.current')}</span>
                        <CheckIcon weight="bold" aria-hidden className="size-4 text-primary" />
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Page>
  )
}
