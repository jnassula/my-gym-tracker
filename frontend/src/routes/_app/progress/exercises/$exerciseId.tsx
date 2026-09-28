import { createFileRoute } from '@tanstack/react-router'

import { ExerciseProgressScreen } from '@/features/progress/exercise-progress-screen'
import { RANGES, type Range } from '@/features/progress/types'

type Search = { range?: Range }

export const Route = createFileRoute('/_app/progress/exercises/$exerciseId')({
  // The range lives in the URL, so back/forward and reloads keep it. Default: 3 months.
  validateSearch: (search: Record<string, unknown>): Search =>
    RANGES.includes(search.range as Range) ? { range: search.range as Range } : {},
  component: ExerciseProgress,
})

function ExerciseProgress() {
  const { exerciseId } = Route.useParams()
  const { range = '3m' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ExerciseProgressScreen
      exerciseId={exerciseId}
      range={range}
      onRangeChange={(next) => void navigate({ search: { range: next }, replace: true })}
    />
  )
}
