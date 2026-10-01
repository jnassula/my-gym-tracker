import { createFileRoute } from '@tanstack/react-router'

import { BodyScreen } from '@/features/body/body-screen'
import { METRICS, type Metric } from '@/features/body/types'
import { RANGES, type Range } from '@/features/progress/types'

type Search = { range?: Range; metric?: Metric }

export const Route = createFileRoute('/_app/progress/body')({
  // The range and the figure live in the URL, so back/forward and reloads keep them.
  // Defaults: 3 months of weight.
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(RANGES.includes(search.range as Range) && { range: search.range as Range }),
    ...(METRICS.includes(search.metric as Metric) && { metric: search.metric as Metric }),
  }),
  component: Body,
})

function Body() {
  const { range = '3m', metric = 'weight' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <BodyScreen
      range={range}
      metric={metric}
      onRangeChange={(next) => void navigate({ search: (search) => ({ ...search, range: next }), replace: true })}
      onMetricChange={(next) => void navigate({ search: (search) => ({ ...search, metric: next }), replace: true })}
    />
  )
}
