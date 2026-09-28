import { describe, expect, it } from 'vitest'

import type { PlanWeek, TrainingSession } from '@/features/training/types'
import type { Day, Exercise, Weekday } from '@/features/workouts/types'

import { firstName, greetingFor, localNow, nextToDo, todayPlan, weekStrip } from './home'

function exercise(id: string, fields: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name: id,
    position: 0,
    muscle_group: 'back',
    sets: 3,
    reps: '12',
    rest_seconds: 60,
    rest_max_seconds: null,
    notes: null,
    ...fields,
  }
}

const day = (id: string, weekday: Weekday | null, exercises: Exercise[] = []): Day => ({
  id,
  weekday,
  label: id,
  position: 0,
  exercises,
})

describe('greetingFor', () => {
  it('follows the time of day', () => {
    expect(greetingFor(4)).toBe('evening')
    expect(greetingFor(5)).toBe('morning')
    expect(greetingFor(11)).toBe('morning')
    expect(greetingFor(12)).toBe('afternoon')
    expect(greetingFor(19)).toBe('afternoon')
    expect(greetingFor(20)).toBe('evening')
  })
})

describe('localNow', () => {
  it('reads the date and hour in the user’s time zone', () => {
    const instant = new Date('2026-09-30T23:30:00Z')
    expect(localNow('Europe/Lisbon', instant)).toEqual({ date: '2026-10-01', hour: 0 })
    expect(localNow('America/Sao_Paulo', instant)).toEqual({ date: '2026-09-30', hour: 20 })
  })
})

describe('firstName', () => {
  it('keeps the first word', () => {
    expect(firstName('  Jonata Assula ')).toBe('Jonata')
    expect(firstName('Ana')).toBe('Ana')
  })
})

describe('todayPlan', () => {
  const days = [day('mon', 0), day('wed', 2), day('fri', 4)]

  it('trains the day on today’s weekday', () => {
    expect(todayPlan(days, 2)).toEqual({ kind: 'train', day: days[1] })
  })

  it('points a rest day to the next training day, wrapping into next week', () => {
    expect(todayPlan(days, 3)).toEqual({ kind: 'rest', next: days[2] })
    expect(todayPlan(days, 5)).toEqual({ kind: 'rest', next: days[0] })
  })

  it('asks to choose when the plan has no weekdays', () => {
    expect(todayPlan([day('a', null), day('b', null)], 2)).toEqual({ kind: 'choose' })
  })
})

describe('nextToDo', () => {
  const warmup = exercise('treadmill', { muscle_group: 'warmup', sets: null })
  const row = exercise('row')
  const pulldown = exercise('pulldown')
  const today = day('wed', 2, [warmup, row, pulldown])
  const session = (sets: number, done: string[] = []): TrainingSession => ({
    id: 's',
    day_id: 'wed',
    local_date: '2026-09-30',
    started_at: '2026-09-30T18:00:00Z',
    ended_at: null,
    done_exercise_ids: done,
    sets: Array.from({ length: sets }, (_, n) => ({
      id: `set-${n}`,
      exercise_id: 'row',
      set_number: n + 1,
      weight: 50,
      reps: 12,
      performed_at: '2026-09-30T18:10:00Z',
    })),
  })

  it('is the first exercise not done yet', () => {
    expect(nextToDo(today, null)).toBe(warmup)
    expect(nextToDo(today, session(2, ['treadmill']))).toBe(row)
    expect(nextToDo(today, session(3, ['treadmill']))).toBe(pulldown)
    expect(nextToDo(today, session(3, ['treadmill', 'pulldown']))).toBeNull()
  })
})

describe('weekStrip', () => {
  const days = [day('mon', 0), day('tue', 1), day('wed', 2), day('fri', 4), day('sat', 5)]
  const week: PlanWeek = {
    today: '2026-09-30', // Wednesday
    week_start: '2026-09-28',
    days: [
      { day_id: 'mon', session_id: 's1', date: '2026-09-28', finished: true, exercises_done: 4, exercises_total: 5, sets: 12 },
      { day_id: 'tue', session_id: null, date: null, finished: false, exercises_done: 0, exercises_total: 5, sets: 0 },
    ],
  }

  it('marks each weekday as done, missed, planned or rest', () => {
    expect(weekStrip(days, week).map(({ state, isToday }) => [state, isToday])).toEqual([
      ['done', false],
      ['missed', false],
      ['planned', true],
      ['rest', false],
      ['planned', false],
      ['planned', false],
      ['rest', false],
    ])
  })
})
