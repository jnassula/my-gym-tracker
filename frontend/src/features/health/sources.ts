/** The data sources and what the screens ask about them (pure). */

/** In the order the screens list them. */
export const PROVIDERS = ['apple_health', 'health_connect'] as const
export type Provider = (typeof PROVIDERS)[number]

/** What the app keeps from a source ("O que lemos"): the watch's heart rate and calories for
 * the workouts, and the scale's weighings (`body`). */
export type HealthSettings = { heart_rate: boolean; calories: boolean; body: boolean }

export type Connection = {
  provider: Provider
  connected: boolean
  last_sync_at: string | null
  settings: HealthSettings
}

export type HealthSources = {
  connections: Connection[]
  /** This week (Monday to Sunday): sessions, and those with watch data. */
  week_sessions: number
  week_synced: number
}

/** Each source's own screen. */
export const PROVIDER_ROUTE = {
  apple_health: '/settings/health',
  health_connect: '/settings/health-connect',
} as const satisfies Record<Provider, string>

export function connectionOf(sources: HealthSources, provider: Provider): Connection {
  return (
    sources.connections.find((connection) => connection.provider === provider) ?? {
      provider,
      connected: false,
      last_sync_at: null,
      settings: { heart_rate: true, calories: true, body: true },
    }
  )
}

export function connectedCount(sources: HealthSources): number {
  return sources.connections.filter((connection) => connection.connected).length
}

/** What to offer when a workout has no watch data yet: running the shortcut (it only exists on
 * the iPhone that has it), waiting for a source's next sync, or nothing while none is connected. */
export function syncAction(sources: HealthSources | undefined, ios: boolean): 'shortcut' | 'wait' | null {
  if (!sources || connectedCount(sources) === 0) return null
  return ios && connectionOf(sources, 'apple_health').connected ? 'shortcut' : 'wait'
}
