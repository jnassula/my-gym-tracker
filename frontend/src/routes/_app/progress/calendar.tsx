import { createFileRoute } from '@tanstack/react-router'

import { CalendarScreen } from '@/features/progress/calendar-screen'

type Search = { month?: string }

export const Route = createFileRoute('/_app/progress/calendar')({
  // "2026-09-01": the first day of the month shown. Missing: the current month.
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search.month === 'string' && /^\d{4}-\d{2}-01$/.test(search.month) ? { month: search.month } : {},
  component: Calendar,
})

function Calendar() {
  const { month = '' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <CalendarScreen month={month} onMonthChange={(next) => void navigate({ search: { month: next } })} />
  )
}
