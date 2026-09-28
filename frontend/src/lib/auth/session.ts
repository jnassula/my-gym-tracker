/**
 * The signed-in session, held in memory only (never localStorage): the access token dies
 * with the tab, and the httpOnly refresh cookie restores it on the next load.
 */
import type { User } from './types'

export type Session = { accessToken: string; user: User }

type Listener = () => void

let current: Session | null = null
const listeners = new Set<Listener>()

export const sessionStore = {
  get: (): Session | null => current,
  set(next: Session | null) {
    current = next
    for (const listener of listeners) listener()
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
