import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { BackLink, Page } from '@/components/app-shell/page'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { weekQuery } from '@/features/training/api'
import { DayScreen } from '@/features/training/day-screen'
import { weekdayOf } from '@/features/training/plan'
import { planQuery } from '@/features/workouts/api'

type Search = { from?: 'home' }

export const Route = createFileRoute('/_app/workouts/$planId/days/$dayId/')({
  // Opened from Início ("Começar treino"): back goes there rather than to the plan's week.
  validateSearch: (search: Record<string, unknown>): Search => (search.from === 'home' ? { from: 'home' } : {}),
  component: PlanDay,
})

function PlanDay() {
  const { planId, dayId } = Route.useParams()
  const { from } = Route.useSearch()
  const plan = useQuery(planQuery(planId))
  const week = useQuery(weekQuery(planId))
  const backLink = from === 'home' ? <BackLink to="/" /> : <BackLink to="/workouts/$planId" params={{ planId }} />

  if (plan.isPending || plan.isError) {
    return (
      <Page title="" backLink={backLink}>
        {plan.isPending ? (
          <Spinner className="mx-auto size-6 text-muted-foreground" />
        ) : (
          <FormAlert messageKey={errorKey(plan.error)} />
        )}
      </Page>
    )
  }
  const weekday = plan.data.days.find((day) => day.id === dayId)?.weekday
  const isToday = week.data !== undefined && weekday === weekdayOf(week.data.today)
  return <DayScreen plan={plan.data} dayId={dayId} isToday={isToday} fromHome={from === 'home'} backLink={backLink} />
}
