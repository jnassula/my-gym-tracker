import { useSyncExternalStore } from 'react'

import { refreshSession } from '@/lib/api'

import { sessionStore, type Session } from './session'

export { sessionStore, type Session } from './session'
export type { User } from './types'

let bootstrap: Promise<unknown> | null = null

/**
 * Resolves the session for route guards. On first call it tries to restore the session from
 * the refresh cookie; afterwards it just reads the in-memory session.
 */
export async function ensureSession(): Promise<Session | null> {
  bootstrap ??= refreshSession()
  await bootstrap
  return sessionStore.get()
}

export function useSession(): Session | null {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get)
}

/** For components under the authenticated layout, where a session is guaranteed. */
export function useRequiredSession(): Session {
  const session = useSession()
  if (!session) throw new Error('useRequiredSession used outside the authenticated layout')
  return session
}
