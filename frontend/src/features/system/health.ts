import { useQuery } from '@tanstack/react-query'

export type HealthStatus = {
  status: 'ok' | 'degraded'
  version: string
  database: 'ok' | 'unavailable'
}

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch('/health', { headers: { Accept: 'application/json' } })
  // A 503 still carries a HealthStatus body saying which component is down.
  if (response.ok || response.status === 503) {
    return (await response.json()) as HealthStatus
  }
  throw new Error(`Healthcheck failed with HTTP ${response.status}`)
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false })
}
