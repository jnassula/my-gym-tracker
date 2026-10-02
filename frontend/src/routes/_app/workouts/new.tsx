import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'

import { BuilderScreen } from '@/features/workouts/builder/builder-screen'
import { STEPS, type BuilderSearch, type Step } from '@/features/workouts/builder/search'

export const Route = createFileRoute('/_app/workouts/new')({
  // The step and the day live in the URL, so the phone's back button walks the steps.
  validateSearch: (search: Record<string, unknown>): BuilderSearch => ({
    ...(STEPS.includes(search.step as Step) && { step: search.step as Step }),
    ...(typeof search.day === 'number' && search.day >= 0 && { day: Math.floor(search.day) }),
    ...(typeof search.duplicate === 'string' && search.duplicate && { duplicate: search.duplicate }),
    ...(search.fresh === true && { fresh: true }),
  }),
  component: NewPlan,
})

function NewPlan() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const onSearchChange = useCallback(
    (next: BuilderSearch, replace = false) => void navigate({ search: next, replace }),
    [navigate],
  )
  return <BuilderScreen search={search} onSearchChange={onSearchChange} />
}
