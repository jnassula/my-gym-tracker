import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { restTimer } from '@/features/training/rest-timer'
import { emptyDraft } from '@/features/workouts/builder/draft'
import { loadDraft, saveDraft } from '@/features/workouts/builder/storage'
import { sessionStore } from '@/lib/auth/session'
import { user } from '@/test/render'

import { logout } from './api'

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc'
const push = vi.hoisted(() => ({ subscribed: true }))

vi.mock('@/features/notifications/push', () => ({
  hasPushDevice: () => push.subscribed,
  unsubscribeDevice: async () => (push.subscribed ? 'https://fcm.googleapis.com/fcm/send/abc' : null),
}))

const fetchMock = vi.fn<typeof fetch>()
const requests = () =>
  fetchMock.mock.calls.map(([input, init]) => {
    const headers = new Headers(init?.headers)
    return `${init?.method} ${String(input)} ${headers.has('Authorization') ? 'as the user' : 'anonymous'}`
  })

beforeEach(() => {
  push.subscribed = true
  fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  localStorage.clear()
  sessionStore.set(null)
})

describe('signing out', () => {
  it('takes this device off the account’s notifications while the session still works', async () => {
    await logout()

    expect(requests()).toEqual([
      `DELETE /api/notifications/subscriptions?endpoint=${encodeURIComponent(ENDPOINT)} as the user`,
      'POST /api/auth/logout anonymous',
    ])
    expect(sessionStore.get()).toBeNull()
  })

  it('leaves the push service alone on a device that never subscribed', async () => {
    push.subscribed = false

    await logout()

    expect(requests()).toEqual(['POST /api/auth/logout anonymous'])
  })

  it('leaves neither the plan draft nor a running rest behind', async () => {
    saveDraft({ ...emptyDraft(), name: 'Full body' })
    restTimer.start(90)

    await logout()

    sessionStore.set({ accessToken: 'access-2', user })
    expect(loadDraft()).toBeNull()
    expect(restTimer.get().endsAt).toBeNull()
  })

  it('still signs out when the server can’t be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    saveDraft({ ...emptyDraft(), name: 'Full body' })

    await expect(logout()).rejects.toThrow()

    expect(sessionStore.get()).toBeNull()
    sessionStore.set({ accessToken: 'access-2', user })
    expect(loadDraft()).toBeNull()
  })
})
