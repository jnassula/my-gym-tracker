import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { planQuery } from '@/features/workouts/api'
import { formatDate, groupByMuscle } from '@/features/workouts/format'
import { useWorkoutLabels } from '@/features/workouts/labels'

export const Route = createFileRoute('/_app/workouts/$planId')({
  component: PlanDetail,
})

/** Read-only plan: days → muscle groups → exercises (the workout flow comes in phase 4). */
function PlanDetail() {
  const { planId } = Route.useParams()
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const plan = useQuery(planQuery(planId))

  if (plan.isPending) {
    return (
      <Page title="" back="/workouts">
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      </Page>
    )
  }
  if (plan.isError) {
    return (
      <Page title="" back="/workouts">
        <FormAlert messageKey={errorKey(plan.error)} />
      </Page>
    )
  }

  const { data } = plan
  return (
    <Page title={data.name} back="/workouts">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {data.is_active && <Badge>{t('workouts.active')}</Badge>}
          {data.valid_until && (
            <span>{t('workouts.validUntil', { date: formatDate(data.valid_until, i18n.language) })}</span>
          )}
        </div>
        {data.days.map((day) => (
          <Card key={day.id} className="gap-3 px-4">
            <header>
              <h2 className="text-base">{labels.weekdayLong(day.weekday)}</h2>
              {day.label && <p className="text-sm text-muted-foreground">{day.label}</p>}
            </header>
            {groupByMuscle(day.exercises).map(({ group, exercises }) => (
              <section key={group ?? 'none'} className="grid gap-1">
                <h3 className="text-xs tracking-widest text-primary uppercase">{labels.group(group)}</h3>
                <ul className="grid">
                  {exercises.map((exercise) => (
                    <li key={exercise.id} className="flex min-h-11 flex-col justify-center py-1">
                      <span className="text-sm font-medium">{exercise.name}</span>
                      <span className="text-xs text-muted-foreground">{labels.scheme(exercise)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </Card>
        ))}
      </div>
    </Page>
  )
}
