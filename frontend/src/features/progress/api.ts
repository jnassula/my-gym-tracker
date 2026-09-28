import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import { api } from '@/lib/api'

import type { ExerciseProgress, ProgressCalendar, ProgressOverview, Range, WeekComparison } from './types'

export const progressKeys = {
  all: ['progress'] as const,
  overview: ['progress', 'overview'] as const,
  exercise: (id: string, range: Range) => ['progress', 'exercise', id, range] as const,
  calendar: (month: string) => ['progress', 'calendar', month] as const,
  weeks: ['progress', 'weeks'] as const,
}

export const overviewQuery = () =>
  queryOptions({ queryKey: progressKeys.overview, queryFn: () => api<ProgressOverview>('/api/progress') })

export const exerciseProgressQuery = (id: string, range: Range) =>
  queryOptions({
    queryKey: progressKeys.exercise(id, range),
    queryFn: () => api<ExerciseProgress>(`/api/progress/exercises/${id}?range=${range}`),
    // Switching range keeps the previous chart on screen until the new one arrives.
    placeholderData: keepPreviousData,
  })

/** `month` is its first day ("2026-09-01"); empty means the current month. */
export const calendarQuery = (month: string) =>
  queryOptions({
    queryKey: progressKeys.calendar(month),
    queryFn: () => api<ProgressCalendar>(`/api/progress/calendar${month ? `?month=${month}` : ''}`),
    placeholderData: keepPreviousData,
  })

export const weeksQuery = () =>
  queryOptions({ queryKey: progressKeys.weeks, queryFn: () => api<WeekComparison>('/api/progress/weeks') })
