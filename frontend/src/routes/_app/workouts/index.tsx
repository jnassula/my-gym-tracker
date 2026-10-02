import { BarbellIcon, CaretRightIcon, PencilSimpleLineIcon, PlusIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/app-shell/empty-state'
import { Page } from '@/components/app-shell/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { FormAlert } from '@/features/auth/form-parts'
import { errorKey } from '@/features/auth/errors'
import { plansQuery } from '@/features/workouts/api'
import { exerciseCount } from '@/features/workouts/builder/draft'
import { NewPlanSheet } from '@/features/workouts/builder/new-plan-sheet'
import { loadDraft } from '@/features/workouts/builder/storage'
import { useWorkoutLabels } from '@/features/workouts/labels'
import { PlanCard } from '@/features/workouts/plan-card'

export const Route = createFileRoute('/_app/workouts/')({
  component: Workouts,
})

function Workouts() {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const plans = useQuery(plansQuery())
  // "+ Novo treino" is the bottom bar's button; the empty state repeats it as the hero.
  const [adding, setAdding] = useState(false)
  // Read on each visit: the builder writes it as the user edits.
  const [draft] = useState(loadDraft)

  return (
    <Page title={t('nav.workouts')}>
      {plans.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : plans.isError ? (
        <FormAlert messageKey={errorKey(plans.error)} />
      ) : plans.data.length === 0 && !draft ? (
        <div className="grid gap-4">
          <EmptyState
            icon={BarbellIcon}
            title={t('empty.workouts.title')}
            description={t('empty.workouts.description')}
          />
          <Button size="hero" onClick={() => setAdding(true)}>
            <PlusIcon />
            {t('builder.new.buttonLabel')}
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3">
          {draft && (
            <li>
              <Link to="/workouts/new" search={{}} className="block rounded-xl">
                <Card className="gap-1 px-4 ring-1 ring-dashed ring-border">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-base">{draft.name.trim() || t('builder.draft.unnamed')}</h2>
                        <Badge variant="secondary">
                          <PencilSimpleLineIcon />
                          {t('builder.draft.title')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {labels.summary(draft.days.length, exerciseCount(draft))}
                      </p>
                    </div>
                    <CaretRightIcon className="mt-1 size-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            </li>
          )}
          {plans.data.map((plan) => (
            <li key={plan.id}>
              <PlanCard plan={plan} />
            </li>
          ))}
        </ul>
      )}
      <NewPlanSheet open={adding} onOpenChange={setAdding} plans={plans.data ?? []} draft={draft} />
    </Page>
  )
}
