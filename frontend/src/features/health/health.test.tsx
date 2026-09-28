import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionScreen } from '@/features/progress/session-screen'
import { SummaryDialog } from '@/features/training/summary-dialog'
import type { SessionDetail } from '@/features/progress/types'
import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import type { HealthStatus } from './api'
import { formatRelative } from './format'
import { HealthScreen } from './health-screen'

const fetchMock = vi.fn<typeof fetch>()
type Handler = (body: unknown) => Response

function serve(routes: Record<string, Handler>) {
  fetchMock.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected request: ${key}`)
    return handler(init?.body ? JSON.parse(String(init.body)) : undefined)
  })
}

const requests = (key: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined))

const off: HealthStatus = {
  connected: false,
  last_sync_at: null,
  settings: { heart_rate: true, calories: true },
  week_sessions: 0,
  week_synced: 0,
}

const on = (): HealthStatus => ({
  ...off,
  connected: true,
  last_sync_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  week_sessions: 4,
  week_synced: 3,
})

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

describe('HealthScreen', () => {
  it('connects and shows the token once, with the address to paste', async () => {
    serve({
      'GET /api/health': () => json(off),
      'POST /api/health/connection': () => json({ token: 'mgt_secret' }, 201),
    })
    renderWithRouter(<HealthScreen />)

    await userEvent.click(await screen.findByRole('button', { name: 'Ligar Apple Health' }))

    expect(await screen.findByText(`${window.location.origin}/api/health/sync`)).toBeInTheDocument()
    expect(screen.getByText('Bearer mgt_secret')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(8)
    expect(screen.getByRole('link', { name: /Correr o atalho/ })).toHaveAttribute(
      'href',
      'shortcuts://run-shortcut?name=myGymTracker',
    )
  })

  it('shows the last sync and this week, and saves what it reads', async () => {
    serve({
      'GET /api/health': () => json(on()),
      'PATCH /api/health/settings': (body) => json({ ...on().settings, ...(body as object) }),
    })
    renderWithRouter(<HealthScreen />)

    expect(await screen.findByText('Última sincronização há 4 minutos')).toBeInTheDocument()
    expect(screen.getByText('3 de 4 treinos desta semana com dados do relógio')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: /Calorias ativas/ }))

    await waitFor(() => expect(requests('PATCH /api/health/settings')).toEqual([{ calories: false }]))
    expect(screen.getByRole('switch', { name: /Calorias ativas/ })).not.toBeChecked()
  })

  it('disconnects after confirming', async () => {
    let status = on()
    serve({
      'GET /api/health': () => json(status),
      'DELETE /api/health/connection': () => {
        status = off
        return new Response(null, { status: 204 })
      },
    })
    renderWithRouter(<HealthScreen />)

    await userEvent.click(await screen.findByRole('button', { name: 'Desligar Apple Health' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desligar' }))

    expect(await screen.findByRole('button', { name: 'Ligar Apple Health' })).toBeInTheDocument()
    expect(requests('DELETE /api/health/connection')).toHaveLength(1)
  })
})

const detail = (health: SessionDetail['health']): SessionDetail => ({
  session_id: 'session-1',
  date: '2026-09-29',
  label: 'Peitoral e Ombros',
  started_at: '2026-09-29T17:05:00Z',
  ended_at: '2026-09-29T18:00:00Z',
  duration_seconds: 3300,
  sets: 8,
  volume: 3200,
  exercises: [
    {
      exercise_id: 'ex-1',
      name: 'Supino Inclinado',
      muscle_group: 'chest',
      sets: 5,
      top_weight: 60,
      first_set_at: '2026-09-29T17:05:00Z',
      peak_heart_rate: health ? 158 : null,
    },
  ],
  health,
})

describe('SessionScreen', () => {
  it('shows what the watch recorded', async () => {
    serve({
      'GET /api/progress/sessions/session-1': () =>
        json(
          detail({
            starts_at: '2026-09-29T17:02:00Z',
            ends_at: '2026-09-29T18:00:00Z',
            avg_heart_rate: 142,
            max_heart_rate: 171,
            calories: 486,
            heart_rate: [
              { at: '2026-09-29T17:05:00Z', bpm: 120 },
              { at: '2026-09-29T17:06:00Z', bpm: 158 },
            ],
          }),
        ),
    })
    renderWithRouter(<SessionScreen sessionId="session-1" />)

    expect(await screen.findByText('Terça 29 set. · 18:02–19:00')).toBeInTheDocument()
    expect(screen.getByText('55 min')).toBeInTheDocument()
    expect(screen.getByText('142 bpm')).toBeInTheDocument()
    expect(screen.getByText('486 kcal')).toBeInTheDocument()
    expect(screen.getByText('máx 171')).toBeInTheDocument()
    expect(screen.getByText('Pico de 158 bpm')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver tabela' }))
    expect(screen.getByRole('table', { name: 'Frequência cardíaca' })).toHaveTextContent('18:05Supino Inclinado139')
  })

  it('offers to connect Apple Health when there is no watch data', async () => {
    serve({
      'GET /api/progress/sessions/session-1': () => json(detail(null)),
      'GET /api/health': () => json(off),
    })
    renderWithRouter(<SessionScreen sessionId="session-1" />)

    expect(await screen.findByRole('link', { name: 'Ligar Apple Health' })).toHaveAttribute('href', '/settings/health')
    expect(screen.getByText('55 min')).toBeInTheDocument()
    expect(screen.queryByText(/Pico de/)).not.toBeInTheDocument()
  })
})

describe('SummaryDialog', () => {
  const summary = { session_id: 'session-1', sets: 8, volume: 3200, duration_seconds: 3300, records: [] }
  const withHeartRate = detail({
    starts_at: '2026-09-29T17:02:00Z',
    ends_at: '2026-09-29T18:00:00Z',
    avg_heart_rate: 142,
    max_heart_rate: 171,
    calories: null,
    heart_rate: [],
  })

  it('shows the average heart rate once synced', async () => {
    serve({
      'GET /api/health': () => json(on()),
      'GET /api/progress/sessions/session-1': () => json(withHeartRate),
    })
    renderWithRouter(<SummaryDialog summary={summary} title="Peito" unit="kg" onClose={() => {}} />)

    expect(await screen.findByText('142 bpm')).toBeInTheDocument()
  })

  it('offers to sync before that, and nothing without Apple Health', async () => {
    serve({
      'GET /api/health': () => json(on()),
      'GET /api/progress/sessions/session-1': () => json(detail(null)),
    })
    const { unmount } = renderWithRouter(
      <SummaryDialog summary={summary} title="Peito" unit="kg" onClose={() => {}} />,
    )
    expect(await screen.findByRole('link', { name: /Sincronizar agora/ })).toHaveAttribute(
      'href',
      'shortcuts://run-shortcut?name=myGymTracker',
    )
    unmount()

    serve({ 'GET /api/health': () => json(off) })
    renderWithRouter(<SummaryDialog summary={summary} title="Peito" unit="kg" onClose={() => {}} />)
    await waitFor(() => expect(requests('GET /api/health').length).toBeGreaterThan(1))
    expect(screen.queryByText('FC média')).not.toBeInTheDocument()
  })
})

describe('formatRelative', () => {
  it('says how long ago in words', () => {
    const now = Date.parse('2026-09-29T18:00:00Z')

    expect(formatRelative('2026-09-29T17:56:00Z', 'pt', now)).toBe('há 4 minutos')
    expect(formatRelative('2026-09-28T18:00:00Z', 'pt', now)).toBe('ontem')
    expect(formatRelative('2026-09-29T17:59:50Z', 'en', now)).toBe('now')
  })
})
