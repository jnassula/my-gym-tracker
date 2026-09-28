import { BarbellIcon, PlusIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/app-shell/empty-state'
import { Page } from '@/components/app-shell/page'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { FormAlert } from '@/features/auth/form-parts'
import { errorKey } from '@/features/auth/errors'
import { plansQuery } from '@/features/workouts/api'
import { PlanCard } from '@/features/workouts/plan-card'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/workouts/')({
  component: Workouts,
})

function Workouts() {
  const { t } = useTranslation()
  const plans = useQuery(plansQuery())

  return (
    <Page
      title={t('nav.workouts')}
      action={
        <Link
          to="/workouts/import"
          aria-label={t('workouts.addPdfLabel')}
          className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }), 'h-11 px-3')}
        >
          <PlusIcon />
          {t('workouts.addPdf')}
        </Link>
      }
    >
      {plans.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : plans.isError ? (
        <FormAlert messageKey={errorKey(plans.error)} />
      ) : plans.data.length === 0 ? (
        <div className="grid gap-4">
          <EmptyState
            icon={BarbellIcon}
            title={t('empty.workouts.title')}
            description={t('empty.workouts.description')}
          />
          <Link to="/workouts/import" className={cn(buttonVariants({ size: 'hero' }))}>
            {t('workouts.importCta')}
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {plans.data.map((plan) => (
            <li key={plan.id}>
              <PlanCard plan={plan} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
