import { api, startSession } from '@/lib/api'
import { sessionStore } from '@/lib/auth'
import type { AccessTokenResponse, AuthResponse } from '@/lib/auth/types'
import type { Language } from '@/i18n'

export type LoginInput = { email: string; password: string; remember: boolean }
export type RegisterInput = {
  name: string
  email: string
  password: string
  language: Language
  timezone: string
}

export async function login(input: LoginInput) {
  return startSession(
    await api<AuthResponse>('/api/auth/login', { method: 'POST', body: input, auth: false }),
  )
}

export async function register(input: RegisterInput) {
  return startSession(
    await api<AuthResponse>('/api/auth/register', { method: 'POST', body: input, auth: false }),
  )
}

export async function logout() {
  try {
    await api<void>('/api/auth/logout', { method: 'POST', auth: false })
  } finally {
    // Even if the request fails, this device forgets the session.
    sessionStore.set(null)
  }
}

export function requestPasswordReset(email: string) {
  return api<void>('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
    auth: false,
  })
}

export function checkResetToken(token: string) {
  return api<{ email: string }>('/api/auth/reset-password/check', {
    method: 'POST',
    body: { token },
    auth: false,
  })
}

export async function resetPassword(token: string, password: string) {
  return startSession(
    await api<AuthResponse>('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password },
      auth: false,
    }),
  )
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const data = await api<AccessTokenResponse>('/api/auth/change-password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  })
  // The server revoked every older access token, this one included.
  const session = sessionStore.get()
  if (session) sessionStore.set({ ...session, accessToken: data.access_token })
}

/** The browser's IANA time zone, stored on the account at sign-up. */
export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Lisbon'
}
