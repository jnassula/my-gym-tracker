import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionScreen } from '@/features/progress/session-screen'
import { SettingsScreen } from '@/features/settings/settings-screen'
import { SummaryDialog } from '@/features/training/summary-dialog'
import type { SessionDetail } from '@/features/progress/types'
import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { formatRelative } from './format'
import { GarminGuide } from './garmin-guide'
import { HealthScreen } from './health-screen'
import { syncAction, type Connection, type HealthSources, type Provider } from './sources'
import { SourcesScreen } from './sources-screen'

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

const disconnected = (provider: Provider): Connection => ({
  provider,
  connected: false,
  last_sync_at: null,
  settings: { heart_rate: true, calories: true },
})

const off: HealthSources = {
  connections: [disconnected('apple_health'), disconnected('health_connect')],
  week_sessions: 0,
  week_synced: 0,
}

/** These sources connected, synced four minutes ago. */
const on = (...providers: Provider[]): HealthSources => ({
  connections: off.connections.map((connection) =>
    providers.includes(connection.provider)
      ? { ...connection, connected: true, last_sync_at: new Date(Date.now() - 4 * 60_000).toISOString() }
      : connection,
  ),
  week_sessions: 4,
  week_synced: 3,
})

const SOURCES = 'GET /api/health/connections'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36'
const onPhone = (userAgent: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('HealthScreen', () => {
  it('connects Apple Health and shows the token once, with the address to paste', async () => {
    onPhone(IPHONE)
    serve({
      [SOURCES]: () => json(off),
      'POST /api/health/connections/apple_health': () => json({ token: 'mgt_secret' }, 201),
    })
    renderWithRouter(<HealthScreen provider="apple_health" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Ligar Apple Health' }))

    expect(await screen.findByText(`${window.location.origin}/api/health/sync`)).toBeInTheDocument()
    expect(screen.getByText('Bearer mgt_secret')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(8)
    expect(screen.getByRole('link', { name: /Correr o atalho/ })).toHaveAttribute(
      'href',
      'shortcuts://run-shortcut?name=myGymTracker',
    )
  })

  it('connects Health Connect and shows how to set the Android app up', async () => {
    onPhone(ANDROID)
    serve({
      [SOURCES]: () => json(off),
      'POST /api/health/connections/health_connect': () => json({ token: 'mgt_android' }, 201),
    })
    renderWithRouter(<HealthScreen provider="health_connect" />)

    expect(await screen.findByRole('heading', { name: 'Health Connect' })).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Ligar Health Connect' }))

    expect(await screen.findByText(`${window.location.origin}/api/health/sync`)).toBeInTheDocument()
    expect(screen.getByText('Bearer mgt_android')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByRole('link', { name: /Google Play/ })).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=com.hcwebhook.app',
    )
    expect(screen.queryByRole('link', { name: /atalho/ })).not.toBeInTheDocument()
  })

  it('shows the last sync and this week, and saves what it reads from that source', async () => {
    serve({
      [SOURCES]: () => json(on('apple_health', 'health_connect')),
      'PATCH /api/health/connections/health_connect/settings': (body) =>
        json({ heart_rate: true, calories: true, ...(body as object) }),
    })
    renderWithRouter(<HealthScreen provider="health_connect" />)

    expect(await screen.findByText('Última sincronização há 4 minutos')).toBeInTheDocument()
    expect(screen.getByText('3 de 4 treinos desta semana com dados do relógio')).toBeInTheDocument()
    expect(screen.getByText(/envia os dados sozinha/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: /Calorias ativas/ }))

    await waitFor(() =>
      expect(requests('PATCH /api/health/connections/health_connect/settings')).toEqual([{ calories: false }]),
    )
    expect(screen.getByRole('switch', { name: /Calorias ativas/ })).not.toBeChecked()
  })

  it('runs the shortcut from the iPhone only', async () => {
    serve({ [SOURCES]: () => json(on('apple_health')) })
    const { unmount } = renderWithRouter(<HealthScreen provider="apple_health" />)
    expect(await screen.findByRole('button', { name: 'Desligar Apple Health' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sincronizar agora' })).not.toBeInTheDocument()
    unmount()

    onPhone(IPHONE)
    renderWithRouter(<HealthScreen provider="apple_health" />)
    expect(await screen.findByRole('link', { name: 'Sincronizar agora' })).toHaveAttribute(
      'href',
      'shortcuts://run-shortcut?name=myGymTracker',
    )
  })

  it('disconnects after confirming', async () => {
    let sources = on('apple_health')
    serve({
      [SOURCES]: () => json(sources),
      'DELETE /api/health/connections/apple_health': () => {
        sources = off
        return new Response(null, { status: 204 })
      },
    })
    renderWithRouter(<HealthScreen provider="apple_health" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Desligar Apple Health' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desligar' }))

    expect(await screen.findByRole('button', { name: 'Ligar Apple Health' })).toBeInTheDocument()
    expect(requests('DELETE /api/health/connections/apple_health')).toHaveLength(1)
  })
})

describe('SourcesScreen', () => {
  it('lists every source with its state, and Strava as coming soon', async () => {
    serve({ [SOURCES]: () => json(on('health_connect')) })
    renderWithRouter(<SourcesScreen />)

    expect(await screen.findByRole('link', { name: /Apple Health.*Desligado/ })).toHaveAttribute(
      'href',
      '/settings/health',
    )
    expect(screen.getByRole('link', { name: /Health Connect.*Ligado/ })).toHaveAttribute(
      'href',
      '/settings/health-connect',
    )
    expect(screen.getByRole('link', { name: /Garmin Connect/ })).toHaveAttribute('href', '/settings/sources/garmin')
    expect(screen.getByText('Strava').closest('a')).toBeNull()
    expect(screen.getByText('Em breve')).toBeInTheDocument()
  })

  it('counts the connected sources in the settings', async () => {
    serve({ 'GET /api/workouts': () => json([]), [SOURCES]: () => json(on('apple_health', 'health_connect')) })
    renderWithRouter(<SettingsScreen />)

    expect(await screen.findByRole('link', { name: /Fontes de dados.*2 ligadas/ })).toHaveAttribute(
      'href',
      '/settings/sources',
    )
  })

  it('sends a Garmin through the health app of the phone in hand', async () => {
    onPhone(IPHONE)
    serve({ [SOURCES]: () => json(on('apple_health')) })
    renderWithRouter(<GarminGuide />)

    const links = await screen.findAllByRole('link', { name: /Ligado|Desligado/ })
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/settings/health', '/settings/health-connect'])
    expect(links[0]).toHaveTextContent('Ligado')
  })
})

describe('syncAction', () => {
  it('offers the shortcut on the iPhone, a wait elsewhere, and nothing while disconnected', () => {
    expect(syncAction(on('apple_health'), true)).toBe('shortcut')
    expect(syncAction(on('apple_health'), false)).toBe('wait')
    expect(syncAction(on('health_connect'), true)).toBe('wait')
    expect(syncAction(off, true)).toBeNull()
    expect(syncAction(undefined, true)).toBeNull()
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

  it('offers to connect a data source when there is no watch data', async () => {
    serve({
      'GET /api/progress/sessions/session-1': () => json(detail(null)),
      [SOURCES]: () => json(off),
    })
    renderWithRouter(<SessionScreen sessionId="session-1" />)

    expect(await screen.findByRole('link', { name: 'Ligar uma fonte de dados' })).toHaveAttribute(
      'href',
      '/settings/sources',
    )
    expect(screen.getByText('55 min')).toBeInTheDocument()
    expect(screen.queryByText(/Pico de/)).not.toBeInTheDocument()
  })

  it('waits for the next sync where there is no shortcut to run', async () => {
    onPhone(ANDROID)
    serve({
      'GET /api/progress/sessions/session-1': () => json(detail(null)),
      [SOURCES]: () => json(on('health_connect')),
    })
    renderWithRouter(<SessionScreen sessionId="session-1" />)

    expect(await screen.findByText(/Chegam com a próxima sincronização/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sincronizar agora' })).not.toBeInTheDocument()
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
      [SOURCES]: () => json(on('health_connect')),
      'GET /api/progress/sessions/session-1': () => json(withHeartRate),
    })
    renderWithRouter(<SummaryDialog summary={summary} title="Peito" unit="kg" onClose={() => {}} />)

    expect(await screen.findByText('142 bpm')).toBeInTheDocument()
  })

  it('offers to run the shortcut before that, and nothing without a data source', async () => {
    onPhone(IPHONE)
    serve({
      [SOURCES]: () => json(on('apple_health')),
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

    serve({ [SOURCES]: () => json(off) })
    renderWithRouter(<SummaryDialog summary={summary} title="Peito" unit="kg" onClose={() => {}} />)
    await waitFor(() => expect(requests(SOURCES).length).toBeGreaterThan(1))
    expect(screen.queryByText('FC média')).not.toBeInTheDocument()
  })

  it('says the heart rate is still to come where the source syncs by itself', async () => {
    onPhone(ANDROID)
    serve({
      [SOURCES]: () => json(on('health_connect')),
      'GET /api/progress/sessions/session-1': () => json(detail(null)),
    })
    renderWithRouter(<SummaryDialog summary={summary} title="Peito" unit="kg" onClose={() => {}} />)

    expect(await screen.findByText('Por sincronizar')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Sincronizar agora/ })).not.toBeInTheDocument()
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
