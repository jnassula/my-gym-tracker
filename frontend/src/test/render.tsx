import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

/** Renders UI that uses router Links/hooks, inside a throwaway single-route router. */
export function renderWithRouter(ui: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

export const json = (body: unknown, status = 200) => Response.json(body, { status })

export const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'jonata@example.pt',
  name: 'Jonata',
  language: 'pt',
  timezone: 'Europe/Lisbon',
  unit: 'kg',
  auto_rest: true,
  created_at: '2026-09-28T10:00:00Z',
  is_admin: false,
} as const

export const authResponse = (token = 'access-1') => ({
  access_token: token,
  token_type: 'bearer',
  expires_in: 900,
  user,
})
