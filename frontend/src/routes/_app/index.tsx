import { CalendarCheckIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/app-shell/empty-state'
import { Page } from '@/components/app-shell/page'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { TodayScreen } from '@/features/training/today'
import { plansQuery } from '@/features/workouts/api'

export const Route = createFileRoute('/_app/')({
  component: Today,
})

function Today() {
  const { t } = useTranslation()
  const plans = useQuery(plansQuery())

  if (plans.isPending || plans.isError) {
    return (
      <Page title={t('nav.today')}>
        {plans.isPending ? (
          <Spinner className="mx-auto size-6 text-muted-foreground" />
        ) : (
          <FormAlert messageKey={errorKey(plans.error)} />
        )}
      </Page>
    )
  }
  const active = plans.data.find((plan) => plan.is_active)
  if (active) return <TodayScreen planId={active.id} />

  return (
    <Page title={t('nav.today')}>
      <div className="grid gap-4">
        <EmptyState
          icon={CalendarCheckIcon}
          title={t('empty.today.title')}
          description={t('empty.today.description')}
        />
        <Link to="/workouts/import" className={cn(buttonVariants({ size: 'hero' }))}>
          {t('workouts.importCta')}
        </Link>
      </div>
    </Page>
  )
}
