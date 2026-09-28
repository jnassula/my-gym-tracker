import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { BackLink, Page } from '@/components/app-shell/page'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { ExerciseScreen } from '@/features/training/exercise-screen'
import { planQuery } from '@/features/workouts/api'

type Search = { from?: 'home' }

export const Route = createFileRoute('/_app/workouts/$planId/days/$dayId/$exerciseId')({
  // The day was opened from Início: going back to it keeps its way back there.
  validateSearch: (search: Record<string, unknown>): Search => (search.from === 'home' ? { from: 'home' } : {}),
  component: PlanExercise,
})

function PlanExercise() {
  const { planId, dayId, exerciseId } = Route.useParams()
  const { from } = Route.useSearch()
  const plan = useQuery(planQuery(planId))
  const backLink = <BackLink to="/workouts/$planId/days/$dayId" params={{ planId, dayId }} search={{ from }} />

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
  return <ExerciseScreen plan={plan.data} dayId={dayId} exerciseId={exerciseId} backLink={backLink} />
}
