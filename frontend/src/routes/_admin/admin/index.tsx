import { createFileRoute } from '@tanstack/react-router'

import { DashboardScreen } from '@/features/admin/dashboard-screen'
import { METRICS, RANGES, type Metric, type Range } from '@/features/admin/types'

type Search = { range?: Range; metric?: Metric }

export const Route = createFileRoute('/_admin/admin/')({
  // The chart's choices live in the URL, so reloads and shared links keep them.
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(RANGES.includes(search.range as Range) && { range: search.range as Range }),
    ...(METRICS.includes(search.metric as Metric) && { metric: search.metric as Metric }),
  }),
  component: Dashboard,
})

function Dashboard() {
  const { range = '30d', metric = 'new_users' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <DashboardScreen
      range={range}
      metric={metric}
      onRangeChange={(next) => void navigate({ search: (search) => ({ ...search, range: next }), replace: true })}
      onMetricChange={(next) => void navigate({ search: (search) => ({ ...search, metric: next }), replace: true })}
    />
  )
}
