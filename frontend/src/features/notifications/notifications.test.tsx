import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { restTimer } from '@/features/training/rest-timer'
import type { PlanSummary } from '@/features/workouts/types'
import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import type { Notifications } from './api'
import { NotificationsScreen } from './notifications-screen'
import { keyBytes } from './push'
import { useRestPush } from './use-rest-push'

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

const notifications: Notifications = {
  public_key: 'BAxWd4sZVQ',
  settings: {
    training_reminder: true,
    reminder_time: '17:30:00',
    rest_end: true,
    weekly_summary: false,
    new_record: true,
    plan_expiring: true,
  },
}

function isoInDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const plan = (valid_until: string | null): PlanSummary => ({
  id: 'plan-1',
  name: 'Treino 01',
  is_active: true,
  valid_until,
  source_file_id: null,
  source_file: null,
  created_at: '2026-09-01T10:00:00Z',
  weekdays: [0, 2],
  day_count: 2,
  exercise_count: 10,
})

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup()
  restTimer.skip()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('NotificationsScreen', () => {
  it('saves the reminders, even where this browser can’t receive push', async () => {
    serve({
      'GET /api/notifications': () => json(notifications),
      'GET /api/workouts': () => json([plan(null)]),
      'PATCH /api/notifications/settings': (body) => json({ ...notifications.settings, ...(body as object) }),
    })
    renderWithRouter(<NotificationsScreen />)

    expect(await screen.findByText('Este browser não suporta notificações.')).toBeInTheDocument()
    expect(screen.getByText('Dias do plano · 17:30')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: /Resumo semanal/ }))

    await waitFor(() => expect(requests('PATCH /api/notifications/settings')).toEqual([{ weekly_summary: true }]))
    expect(screen.getByRole('switch', { name: /Resumo semanal/ })).toBeChecked()
  })

  it('says when the server has push turned off', async () => {
    serve({
      'GET /api/notifications': () => json({ ...notifications, public_key: null }),
      'GET /api/workouts': () => json([]),
    })
    renderWithRouter(<NotificationsScreen />)

    expect(await screen.findByText('O servidor não tem as notificações configuradas.')).toBeInTheDocument()
  })

  it('turns notifications on for this device', async () => {
    let current: unknown = null
    const subscription = {
      endpoint: 'https://push.example/v1/abc',
      toJSON: () => ({ endpoint: 'https://push.example/v1/abc', keys: { p256dh: 'BNc', auth: 'tBH' } }),
    }
    const subscribe = vi.fn(async () => {
      current = subscription
      return subscription
    })
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => 'granted') })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => current, subscribe } }) },
    })
    serve({
      'GET /api/notifications': () => json(notifications),
      'GET /api/workouts': () => json([]),
      'POST /api/notifications/subscriptions': () => new Response(null, { status: 204 }),
    })
    renderWithRouter(<NotificationsScreen />)

    await userEvent.click(await screen.findByRole('button', { name: 'Ativar notificações neste dispositivo' }))

    expect(await screen.findByText('Ativas neste dispositivo.')).toBeInTheDocument()
    expect(requests('POST /api/notifications/subscriptions')).toEqual([subscription.toJSON()])
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }))
    expect(localStorage.getItem('mygymtracker-push-endpoint')).toBe(subscription.endpoint)
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('nudges when the plan is about to expire', async () => {
    serve({
      'GET /api/notifications': () => json(notifications),
      'GET /api/workouts': () => json([plan(isoInDays(5))]),
    })
    renderWithRouter(<NotificationsScreen />)

    expect(await screen.findByText('Este plano expira em 5 dias')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Importar novo plano/ })).toHaveAttribute('href', '/workouts/import')
  })
})

describe('push helpers', () => {
  it('turns the base64url VAPID key into bytes', () => {
    expect([...keyBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239])
  })
})

function RestPush() {
  useRestPush()
  return null
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useRestPush', () => {
  it('asks for the push when the app leaves mid-rest, and cancels it on return', async () => {
    localStorage.setItem('mygymtracker-push-endpoint', 'https://push.example/v1/abc')
    serve({
      'GET /api/notifications': () => json(notifications),
      'POST /api/notifications/rest': () => new Response(null, { status: 204 }),
      'DELETE /api/notifications/rest': () => new Response(null, { status: 204 }),
    })
    renderWithRouter(<RestPush />)
    await waitFor(() => expect(requests('GET /api/notifications')).toHaveLength(1))
    restTimer.start(90)

    setVisibility('hidden')
    await waitFor(() => expect(requests('POST /api/notifications/rest')).toHaveLength(1))
    setVisibility('visible')

    await waitFor(() => expect(requests('DELETE /api/notifications/rest')).toHaveLength(1))
    const [{ ends_at: endsAt }] = requests('POST /api/notifications/rest') as Array<{ ends_at: string }>
    expect(Date.parse(endsAt)).toBe(restTimer.get().endsAt)
  })

  it('stays quiet without a rest, a device or the setting', async () => {
    serve({ 'GET /api/notifications': () => json(notifications) })
    renderWithRouter(<RestPush />)
    await waitFor(() => expect(requests('GET /api/notifications')).toHaveLength(1))
    restTimer.start(90) // no device subscribed here

    setVisibility('hidden')
    setVisibility('visible')

    expect(requests('POST /api/notifications/rest')).toEqual([])
  })
})
