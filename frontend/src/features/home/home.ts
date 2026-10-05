/** Rules of the Início screen (pure, unit-tested). */
import { addDays, inHand, isDone, screenOrder } from '@/features/training/plan'
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

/** The first exercise not done yet, in the order the day screen lists them. */
export function nextToDo(day: Day, session: TrainingSession | null): Exercise | null {
  return screenOrder(day).find((exercise) => !isDone(exercise, session)) ?? null
}

export type StripState = 'trained' | 'planned' | 'idle'
export type StripCell = {
  date: string
  weekday: Weekday
  state: StripState
  isToday: boolean
  /** The workout of that date (the latest, of two), to open. */
  sessionId: string | null
  /** The plan's day trained on that date, or the one the plan has for it. */
  day: Day | null
}

/**
 * Monday to Sunday of this week, by date: what was trained on each (whatever the plan had there),
 * and where a workout is still to come. A day gone by without one is just a day: nothing is
 * "missed", the week's count says how it is going.
 */
export function weekStrip(days: Day[], week: PlanWeek): StripCell[] {
  const status = new Map(week.days.map((item) => [item.day_id, item]))
  const byId = new Map(days.map((day) => [day.id, day]))
  return WEEKDAYS.map((weekday) => {
    const date = addDays(week.week_start, weekday)
    const isToday = date === week.today
    // Today's only counts once it is complete; until then it is the workout in hand.
    const workout = week.sessions.filter((item) => item.date === date && (!isToday || item.complete)).at(-1)
    if (workout) {
      const day = (workout.day_id && byId.get(workout.day_id)) || null
      return { date, weekday, state: 'trained', isToday, sessionId: workout.session_id, day }
    }
    // Still to come: today, the workout in hand; later in the week, the plan's own day for
    // that weekday while it wasn't trained.
    const day = isToday
      ? inHand(week)
        ? (byId.get(week.suggestion.day_id ?? '') ?? null)
        : null
      : date > week.today
        ? (days.find((item) => item.weekday === weekday && !status.get(item.id)?.trained) ?? null)
        : null
    return { date, weekday, state: day ? 'planned' : 'idle', isToday, sessionId: null, day }
  })
}
