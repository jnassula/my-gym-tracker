/**
 * Fetch wrapper for the API: JSON in/out, bearer token, and the `{detail, code}` error shape.
 *
 * An expired or revoked access token triggers one refresh (via the httpOnly cookie) and a
 * single retry. Refreshes are single-flight inside a tab and serialised across tabs with the
 * Web Locks API, so two tabs never race to rotate the same refresh token (which the backend
 * would treat as token theft).
 */
import { applyLanguage } from '@/i18n'

import { sessionStore, type Session } from './auth/session'
import type { AuthResponse } from './auth/types'

export type FieldError = { loc: Array<string | number>; msg: string; type: string }

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: FieldError[]

  constructor(status: number, code: string, detail: string, fieldErrors: FieldError[] = []) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

/** Thrown when the server cannot be reached at all. */
export class NetworkError extends Error {
  readonly code = 'network'
}

const REFRESH_LOCK = 'mygymtracker-auth-refresh'

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { detail?: string; code?: string; errors?: FieldError[] }
    return new ApiError(
      response.status,
      body.code ?? 'unknown',
      body.detail ?? response.statusText,
      body.errors,
    )
  } catch {
    return new ApiError(response.status, 'unknown', response.statusText)
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    throw new NetworkError('Network request failed')
  }
}

export function startSession(data: AuthResponse): Session {
  const session = { accessToken: data.access_token, user: data.user }
  sessionStore.set(session)
  applyLanguage(data.user.language)
  return session
}

async function doRefresh(): Promise<Session | null> {
  const response = await send('/api/auth/refresh', { method: 'POST' })
  if (!response.ok) {
    sessionStore.set(null)
    return null
  }
  return startSession((await response.json()) as AuthResponse)
}

let inflight: Promise<Session | null> | null = null

export function refreshSession(): Promise<Session | null> {
  inflight ??= (
    typeof navigator !== 'undefined' && 'locks' in navigator
      ? navigator.locks.request(REFRESH_LOCK, doRefresh)
      : doRefresh()
  ).finally(() => {
    inflight = null
  })
  return inflight
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** Attach the access token and refresh it on 401 (default true). */
  auth?: boolean
  /** "blob" for files (e.g. a PDF to show); JSON otherwise. */
  responseType?: 'json' | 'blob'
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, responseType = 'json' } = options

  // FormData (file uploads) goes as multipart; the browser sets the boundary header.
  const isForm = body instanceof FormData
  const attempt = () => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
    const token = auth ? sessionStore.get()?.accessToken : undefined
    if (token) headers.Authorization = `Bearer ${token}`
    return send(path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  }

  let response = await attempt()
  if (auth && response.status === 401) {
    // Missing, expired or revoked access token: the refresh cookie may still be valid.
    const error = await toApiError(response)
    if (!(await refreshSession())) throw error
    response = await attempt()
  }
  if (!response.ok) throw await toApiError(response)
  if (response.status === 204 || response.status === 202) return undefined as T
  if (responseType === 'blob') return (await response.blob()) as T
  return (await response.json()) as T
}
