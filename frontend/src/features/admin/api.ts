import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query'

import { api } from '@/lib/api'

import type { AdminOverview, AdminUsers, Growth, Range } from './types'

export const PAGE_SIZE = 25

export const adminKeys = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  growth: (range: Range) => ['admin', 'growth', range] as const,
  users: (search: string, pageSize: number) => ['admin', 'users', search, pageSize] as const,
}

export const adminOverviewQuery = () =>
  queryOptions({ queryKey: adminKeys.overview, queryFn: () => api<AdminOverview>('/api/admin/overview') })

export const growthQuery = (range: Range) =>
  queryOptions({
    queryKey: adminKeys.growth(range),
    queryFn: () => api<Growth>(`/api/admin/growth?range=${range}`),
    // Switching range keeps the previous chart on screen until the new one arrives.
    placeholderData: keepPreviousData,
  })

/** Accounts, newest first, a page at a time; `search` matches names and emails. */
export const usersQuery = (search: string, pageSize = PAGE_SIZE) =>
  infiniteQueryOptions({
    queryKey: adminKeys.users(search, pageSize),
    queryFn: ({ pageParam }) =>
      api<AdminUsers>(
        `/api/admin/users?limit=${pageSize}&offset=${pageParam}${search ? `&q=${encodeURIComponent(search)}` : ''}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0)
      return loaded < last.total ? loaded : undefined
    },
    placeholderData: keepPreviousData,
  })
