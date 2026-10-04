import { disableDevice } from '@/features/notifications/api'
import { hasPushDevice, unsubscribeDevice } from '@/features/notifications/push'
import { restTimer } from '@/features/training/rest-timer'
import { clearDraft } from '@/features/workouts/builder/storage'
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

/** Creates the account. It opens with the link sent to its address (`verifyEmail`). */
export function signUp(input: RegisterInput) {
  return api<void>('/api/auth/signup', { method: 'POST', body: input, auth: false })
}

/** The confirmation link was opened: the account is confirmed and this device signed in. */
export async function verifyEmail(token: string) {
  return startSession(
    await api<AuthResponse>('/api/auth/verify-email', { method: 'POST', body: { token }, auth: false }),
  )
}

/** The confirmation link again; the server says the same whatever the address is. */
export function resendVerification(email: string) {
  return api<void>('/api/auth/verify-email/resend', { method: 'POST', body: { email }, auth: false })
}

/** How long signing out waits for the push service before going on without it. */
const DEVICE_TIMEOUT_MS = 3000

/** While the session still works: this device stops getting the account's notifications. */
async function forgetThisDevice() {
  if (!hasPushDevice()) return
  const giveUp = new Promise<void>((resolve) => setTimeout(resolve, DEVICE_TIMEOUT_MS))
  await Promise.race([disableDevice(), giveUp]).catch(() => undefined)
}

/** What a signed-out device no longer holds of the account. */
function forgetAccount() {
  clearDraft()
  restTimer.skip()
  sessionStore.set(null)
}

/**
 * Deletes the account (the server asks for the password again) and leaves nothing of it here.
 * The server forgot the account's devices with it; this browser stops listening for them too.
 */
export async function deleteAccount(password: string) {
  await api<void>('/api/users/me', { method: 'DELETE', body: { password } })
  if (hasPushDevice()) {
    const giveUp = new Promise<null>((resolve) => setTimeout(() => resolve(null), DEVICE_TIMEOUT_MS))
    await Promise.race([unsubscribeDevice(), giveUp]).catch(() => null)
  }
  forgetAccount()
}

/**
 * Signing out leaves nothing of the account on the device: the next person to use it gets
 * neither its reminders nor its plan draft. (A session that merely expired keeps the draft,
 * under the account's own key.)
 */
export async function logout() {
  await forgetThisDevice()
  try {
    await api<void>('/api/auth/logout', { method: 'POST', auth: false })
  } finally {
    // Even if the request fails, this device forgets the session.
    forgetAccount()
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
