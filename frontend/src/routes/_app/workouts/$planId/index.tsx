import { createFileRoute } from '@tanstack/react-router'

import { PlanWeekScreen } from '@/features/training/plan-week'

export const Route = createFileRoute('/_app/workouts/$planId/')({
  component: PlanWeek,
})

function PlanWeek() {
  const { planId } = Route.useParams()
  return <PlanWeekScreen planId={planId} />
}
