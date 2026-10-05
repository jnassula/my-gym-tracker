/** Rules of the activities screens (pure, unit-tested). */
import type { PlanWeek } from '@/features/training/types'

import type { PlanDayRegions, Region } from './types'

/** The plan's days an activity keeps away: those that work a region it avoids. */
export function avoided(planDays: PlanDayRegions[], avoid: Region[]): PlanDayRegions[] {
  return planDays.filter((day) => day.regions.some((region) => avoid.includes(region)))
}

/** Whether an activity is on a date of the week (by its fixed day, or marked). */
export function isOn(week: PlanWeek, activityId: string, date: string): boolean {
  return week.activities.some((item) => item.activity_id === activityId && item.date === date)
}
