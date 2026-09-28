import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { authResponse, json } from '@/test/render'

import { api, ApiError, NetworkError } from './api'
import { sessionStore } from './auth/session'

const fetchMock = vi.fn<typeof fetch>()

function authHeader(call: number) {
  const init = fetchMock.mock.calls[call][1]
  return (init?.headers as Record<string, string> | undefined)?.Authorization
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'stale', user: authResponse().user })
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  sessionStore.set(null)
})

describe('api', () => {
  it('sends the access token and parses JSON', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }))

    await expect(api('/api/things')).resolves.toEqual({ ok: true })
    expect(authHeader(0)).toBe('Bearer stale')
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ detail: 'expired', code: 'token_expired' }, 401))
      .mockResolvedValueOnce(json(authResponse('fresh')))
      .mockResolvedValueOnce(json({ ok: true }))

    await expect(api('/api/things')).resolves.toEqual({ ok: true })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh')
    expect(authHeader(2)).toBe('Bearer fresh')
    expect(sessionStore.get()?.accessToken).toBe('fresh')
  })

  it('shares a single refresh between concurrent 401s', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (input === '/api/auth/refresh') return json(authResponse('fresh'))
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      return auth === 'Bearer fresh' ? json({ ok: true }) : json({ code: 'token_expired' }, 401)
    })

    await Promise.all([api('/api/a'), api('/api/b'), api('/api/c')])

    const refreshes = fetchMock.mock.calls.filter(([input]) => input === '/api/auth/refresh')
    expect(refreshes).toHaveLength(1)
  })

  it('drops the session when the refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ detail: 'expired', code: 'token_expired' }, 401))
      .mockResolvedValueOnce(json({ detail: 'gone', code: 'invalid_refresh_token' }, 401))

    await expect(api('/api/things')).rejects.toMatchObject({ status: 401, code: 'token_expired' })
    expect(sessionStore.get()).toBeNull()
  })

  it('does not refresh for unauthenticated calls', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ detail: 'Invalid email or password', code: 'invalid_credentials' }, 401),
    )

    const error = await api('/api/auth/login', { method: 'POST', body: {}, auth: false }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'invalid_credentials' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('turns connection failures into NetworkError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(api('/api/things')).rejects.toBeInstanceOf(NetworkError)
  })
})
