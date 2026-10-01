import type { Language } from '@/i18n'

export const RANGES = ['30d', '12w', '12m'] as const
export type Range = (typeof RANGES)[number]

/** What the growth chart shows; the names are the API's fields. */
export const METRICS = ['new_users', 'total_users', 'active_users'] as const
export type Metric = (typeof METRICS)[number]

export type Unit = 'day' | 'week' | 'month'

/** A figure for a period and for the period of the same length before it. */
export type Change = { current: number; previous: number }

export type Funnel = { registered: number; with_plan: number; trained: number; active_30d: number }

export type AdminOverview = {
  /** Deactivated accounts included. */
  total_users: number
  deactivated_users: number
  new_users_7d: Change
  new_users_30d: Change
  /** Active: logged a workout in the period. */
  active_users_7d: Change
  active_users_30d: Change
  workouts_total: number
  workouts_7d: Change
  funnel: Funnel
  adoption: { apple_health: number; health_connect: number; notifications: number }
  languages: Array<{ language: Language; users: number }>
}

export type GrowthPoint = { start: string; new_users: number; total_users: number; active_users: number }

export type Growth = { range: Range; unit: Unit; points: GrowthPoint[] }

/** Account data and counts only: nothing of what the person trains. */
export type AdminUser = {
  id: string
  name: string
  email: string
  language: Language
  created_at: string
  /** Set by an administrator: the account can't sign in, its data stays. */
  deactivated_at: string | null
  /** An administrator's account can't be deactivated or deleted from the backoffice. */
  is_admin: boolean
  plans: number
  workouts: number
  last_workout_date: string | null
}

export type AdminUsers = { total: number; items: AdminUser[] }
