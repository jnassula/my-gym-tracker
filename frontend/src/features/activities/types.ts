/** Mirrors the backend schemas in app/activities/schemas.py. */
import type { Weekday } from '@/features/workouts/types'

/** The regions of the body a workout works, and an activity may not want to share a day with. */
export const REGIONS = ['upper', 'lower', 'core'] as const
export type Region = (typeof REGIONS)[number]

/** Something the user does besides the gym: footvolley, surf. */
export type Activity = {
  id: string
  name: string
  /** The weekdays it is always on (0 = Monday). Empty: marked by hand on the day. */
  weekdays: Weekday[]
  avoid: Region[]
}

/** A day of the active plan with the regions it works (worked out by the server). */
export type PlanDayRegions = { day_id: string; label: string; weekday: Weekday | null; regions: Region[] }

export type Activities = { activities: Activity[]; plan_days: PlanDayRegions[] }

export type ActivityDraft = Omit<Activity, 'id'>
