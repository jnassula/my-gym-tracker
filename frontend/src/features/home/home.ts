/** Rules of the Início screen (pure, unit-tested). */
import { isDayDone, isDone, screenOrder, weekdayOf } from '@/features/training/plan'
import type { PlanWeek, TrainingSession } from '@/features/training/types'
import { WEEKDAYS, type Day, type Exercise, type Weekday } from '@/features/workouts/types'

export type Greeting = 'morning' | 'afternoon' | 'evening'

/** "Bom dia" from 5:00, "boa tarde" from noon, "boa noite" from 20:00. */
export function greetingFor(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 20) return 'afternoon'
  return 'evening'
}

/** The date ("2026-09-30") and hour in the user's time zone, where their "today" is counted. */
export function localNow(timeZone: string, now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) }
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

export type TodayPlan =
  | { kind: 'train'; day: Day }
  /** No day on today's weekday: the next one this week or next. */
  | { kind: 'rest'; next: Day }
  /** The plan rotates days (A/B/C) instead of fixing weekdays. */
  | { kind: 'choose' }

export function todayPlan(days: Day[], today: number): TodayPlan {
  const day = days.find((item) => item.weekday === today)
  if (day) return { kind: 'train', day }
  const [next] = days
    .filter((item) => item.weekday !== null)
    .sort((a, b) => (((a.weekday ?? 0) - today + 7) % 7) - (((b.weekday ?? 0) - today + 7) % 7))
  return next ? { kind: 'rest', next } : { kind: 'choose' }
}

/** The first exercise not done yet, in the order the day screen lists them. */
export function nextToDo(day: Day, session: TrainingSession | null): Exercise | null {
  return screenOrder(day).find((exercise) => !isDone(exercise, session)) ?? null
}

export type StripState = 'done' | 'missed' | 'planned' | 'rest'
export type StripDay = { weekday: Weekday; day: Day | null; state: StripState; isToday: boolean }

/** Monday to Sunday of this week: what was trained, missed, still planned, or rest. */
export function weekStrip(days: Day[], week: PlanWeek): StripDay[] {
  const today = weekdayOf(week.today)
  const status = new Map(week.days.map((item) => [item.day_id, item]))
  return WEEKDAYS.map((weekday) => {
    const day = days.find((item) => item.weekday === weekday) ?? null
    const state: StripState = !day
      ? 'rest'
      : isDayDone(status.get(day.id))
        ? 'done'
        : weekday < today
          ? 'missed'
          : 'planned'
    return { weekday, day, state, isToday: weekday === today }
  })
}
