import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsScreen } from '@/features/settings/settings-screen'
import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { DashboardScreen } from './dashboard-screen'
import type { AdminOverview, AdminUser, Growth } from './types'
import { UsersScreen } from './users-screen'

const fetchMock = vi.fn<typeof fetch>()

function serve(routes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input) => {
    const path = String(input)
    if (!(path in routes)) throw new Error(`Unexpected request: ${path}`)
    return json(routes[path])
  })
}

const requested = () => fetchMock.mock.calls.map(([input]) => String(input))

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user: { ...user, is_admin: true } })
})

afterEach(() => {
  cleanup() // before the session goes: the tables read the administrator's time zone
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

const overview: AdminOverview = {
  total_users: 1240,
  deactivated_users: 3,
  new_users_7d: { current: 18, previous: 12 },
  new_users_30d: { current: 60, previous: 75 },
  active_users_7d: { current: 310, previous: 310 },
  active_users_30d: { current: 496, previous: 450 },
  workouts_total: 12840,
  workouts_7d: { current: 905, previous: 880 },
  funnel: { registered: 1240, with_plan: 930, trained: 744, active_30d: 496 },
  adoption: { apple_health: 124, health_connect: 62, notifications: 372 },
  languages: [
    { language: 'pt', users: 1116 },
    { language: 'en', users: 124 },
  ],
}

const growth: Growth = {
  range: '30d',
  unit: 'day',
  points: [
    { start: '2026-09-27', new_users: 2, total_users: 1237, active_users: 40 },
    { start: '2026-09-28', new_users: 3, total_users: 1240, active_users: 52 },
  ],
}

const account = (name: string, fields: Partial<AdminUser> = {}): AdminUser => ({
  id: `id-${name}`,
  name,
  email: `${name.toLowerCase()}@example.pt`,
  language: 'pt',
  // 23:30 UTC is already the 27th in Lisbon, the administrator's time zone.
  created_at: '2026-09-26T23:30:00Z',
  deactivated_at: null,
  is_admin: false,
  plans: 1,
  workouts: 14,
  last_workout_date: '2026-09-28',
  ...fields,
})

const tile = (label: string) => screen.getByText(label).parentElement as HTMLElement

describe('DashboardScreen', () => {
  const props = { range: '30d', metric: 'new_users', onRangeChange: vi.fn(), onMetricChange: vi.fn() } as const

  beforeEach(() => {
    serve({
      '/api/admin/overview': overview,
      '/api/admin/growth?range=30d': growth,
      '/api/admin/users?limit=5&offset=0': { total: 1240, items: [account('Ana'), account('Bruno')] },
    })
  })

  it('shows each figure against the period before', async () => {
    renderWithRouter(<DashboardScreen {...props} />)

    expect(await screen.findByText('Contas', { selector: 'span' })).toBeInTheDocument()
    // pt-PT only groups thousands from five digits on.
    expect(within(tile('Contas')).getByText('1240')).toBeInTheDocument()
    expect(within(tile('Contas')).getByText(/^12\s840 treinos registados$/)).toBeInTheDocument()
    expect(within(tile('Novas · 7 dias')).getByText('18')).toBeInTheDocument()
    expect(within(tile('Novas · 7 dias')).getByText('+6 vs. 7 dias antes')).toBeInTheDocument()
    expect(within(tile('Novas · 30 dias')).getByText('−15 vs. 30 dias antes')).toBeInTheDocument()
    expect(within(tile('Ativas · 7 dias')).getByText('Igual ao período anterior')).toBeInTheDocument()
  })

  it('shows how far accounts get and what they use', async () => {
    renderWithRouter(<DashboardScreen {...props} />)

    const plan = (await screen.findByText('Criaram um plano')).closest('li') as HTMLElement
    expect(within(plan).getByText('930 · 75%')).toBeInTheDocument()
    expect(within(screen.getByText('Treinaram nos últimos 30 dias').closest('li') as HTMLElement).getByText('496 · 40%')).toBeInTheDocument()
    expect(screen.getByText('Apple Health ligado').nextElementSibling).toHaveTextContent('124 · 10%')
    expect(screen.getByText('Health Connect ligado').nextElementSibling).toHaveTextContent('62 · 5%')
    expect(screen.getByText('Idioma EN').nextElementSibling).toHaveTextContent('124 · 10%')
  })

  it('names the chart and offers it as a table, newest first', async () => {
    renderWithRouter(<DashboardScreen {...props} />)

    expect(await screen.findByRole('heading', { name: 'Novas contas por dia' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver tabela' }))

    const rows = screen.getAllByRole('row').filter((row) => within(row).queryByRole('rowheader', { name: /set\. 2026/ }))
    expect(rows.map((row) => row.textContent)).toEqual(['28 set. 20263124052', '27 set. 20262123740'])
  })

  it('asks for another range or figure', async () => {
    renderWithRouter(<DashboardScreen {...props} />)

    await userEvent.click(within(await screen.findByRole('group', { name: 'Período' })).getByRole('button', { name: '12 semanas' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Indicador' })).getByRole('button', { name: 'Total' }))

    expect(props.onRangeChange).toHaveBeenCalledWith('12w')
    expect(props.onMetricChange).toHaveBeenCalledWith('total_users')
  })

  it('lists the latest accounts on the day they joined, here', async () => {
    renderWithRouter(<DashboardScreen {...props} />)

    const ana = (await screen.findByRole('rowheader', { name: /Ana/ })).closest('tr') as HTMLElement
    expect(within(ana).getByText('ana@example.pt')).toBeInTheDocument()
    expect(within(ana).getByText('27 set. 2026')).toBeInTheDocument()
    expect(within(ana).getByText('14')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/admin/users')
  })
})

describe('UsersScreen', () => {
  it('loads more accounts and searches by name or email', async () => {
    serve({
      '/api/admin/users?limit=25&offset=0': { total: 2, items: [account('Ana')] },
      '/api/admin/users?limit=25&offset=1': { total: 2, items: [account('Bruno', { last_workout_date: null })] },
      '/api/admin/users?limit=25&offset=0&q=Carla%20s': { total: 1, items: [account('Carla')] },
    })
    renderWithRouter(<UsersScreen />)

    expect(await screen.findByText('2 contas')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByRole('rowheader', { name: /Bruno/ })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /Ana/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Procurar nome ou email' }), ' Carla s ')

    expect(await screen.findByRole('rowheader', { name: /Carla/ })).toBeInTheDocument()
    expect(screen.getByText('1 conta')).toBeInTheDocument()
    // One request once the typing paused, not one per key.
    expect(requested().filter((path) => path.includes('&q='))).toHaveLength(1)
  })

  it('says when nobody matches', async () => {
    serve({ '/api/admin/users?limit=25&offset=0': { total: 0, items: [] } })
    renderWithRouter(<UsersScreen />)

    expect(await screen.findByText('Nenhuma conta encontrada.')).toBeInTheDocument()
  })
})

describe('SettingsScreen', () => {
  it('opens the backoffice for administrators only', async () => {
    serve({ '/api/workouts': [], '/api/health/connections': { connections: [], week_sessions: 0, week_synced: 0 } })
    const { unmount } = renderWithRouter(<SettingsScreen />)

    expect(await screen.findByRole('link', { name: 'Backoffice' })).toHaveAttribute('href', '/admin')

    unmount()
    sessionStore.set({ accessToken: 'access-1', user })
    renderWithRouter(<SettingsScreen />)

    expect(await screen.findByRole('heading', { name: 'Definições' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Backoffice' })).not.toBeInTheDocument()
  })
})
