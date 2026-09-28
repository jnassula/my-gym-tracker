import { describe, expect, it } from 'vitest'

import type { Day, Exercise } from '@/features/workouts/types'

import {
  addDays,
  dayProgress,
  isDayDone,
  isDone,
  isTicked,
  nextExercise,
  plannedReps,
  suggestion,
  weekdayOf,
} from './plan'
import type { LoggedSet, TrainingSession } from './types'

function exercise(id: string, fields: Partial<Exercise> = {}): Exercise {
  return {
    id,
    position: 0,
    name: id,
    muscle_group: 'back',
    sets: 3,
    reps: '12',
    rest_seconds: 80,
    rest_max_seconds: null,
    notes: null,
    ...fields,
  }
}

function set(exerciseId: string, n: number, weight = 50, reps = 12): LoggedSet {
  return {
    id: `${exerciseId}-${n}`,
    exercise_id: exerciseId,
    set_number: n,
    weight,
    reps,
    performed_at: '2026-09-30T18:00:00Z',
  }
}

function session(sets: LoggedSet[], done: string[] = []): TrainingSession {
  return {
    id: 's1',
    day_id: 'd1',
    local_date: '2026-09-30',
    started_at: '2026-09-30T17:30:00Z',
    ended_at: null,
    done_exercise_ids: done,
    sets,
  }
}

const day: Day = {
  id: 'd1',
  weekday: 2,
  label: 'Costas',
  position: 0,
  exercises: [
    exercise('treadmill', { muscle_group: 'warmup', sets: null, reps: '30 min' }),
    exercise('row'),
    exercise('pulldown', { muscle_group: 'back' }),
    exercise('face-pull', { muscle_group: 'shoulders' }),
  ],
}

describe('done', () => {
  it('counts an exercise done by its planned sets or by hand', () => {
    const today = session([set('row', 1), set('row', 2), set('row', 3), set('pulldown', 1)], ['treadmill'])

    expect(isDone(day.exercises[0], today)).toBe(true) // ticked (no planned sets: one would do)
    expect(isTicked(day.exercises[0], today)).toBe(true)
    expect(isDone(day.exercises[1], today)).toBe(true) // 3/3
    expect(isTicked(day.exercises[1], today)).toBe(false)
    expect(isDone(day.exercises[2], today)).toBe(false) // 1/3
    expect(dayProgress(day, today)).toEqual({ done: 2, total: 4 })
    expect(dayProgress(day, null)).toEqual({ done: 0, total: 4 })
  })

  it('counts a week day done when finished or complete', () => {
    const status = { day_id: 'd1', session_id: 's1', date: '2026-09-30', sets: 5 }
    expect(isDayDone(undefined)).toBe(false)
    expect(isDayDone({ ...status, finished: true, exercises_done: 1, exercises_total: 4 })).toBe(true)
    expect(isDayDone({ ...status, finished: false, exercises_done: 4, exercises_total: 4 })).toBe(true)
    expect(isDayDone({ ...status, finished: false, exercises_done: 3, exercises_total: 4 })).toBe(false)
  })
})

describe('what comes next', () => {
  it('moves through the day in screen order, across muscle groups', () => {
    expect(nextExercise(day, 'treadmill')?.id).toBe('row')
    expect(nextExercise(day, 'pulldown')?.id).toBe('face-pull')
    expect(nextExercise(day, 'face-pull')).toBeNull()
  })

  it.each([
    ['12', 0, 12],
    ['8-12', 0, 12],
    ['8 - 12', 2, 12],
    ['15/12/10', 0, 15],
    ['15/12/10', 1, 12],
    ['15/12/10', 5, 10],
    ['15/8-12', 1, 12],
    ['falha', 0, null],
    ['30 min', 0, null],
    [null, 0, null],
  ])('reads %j set %i as %j reps', (reps, index, expected) => {
    expect(plannedReps(reps, index)).toBe(expected)
  })

  it('suggests today’s last weight, else last time’s same set, and the plan’s reps', () => {
    const last = { date: '2026-09-23', sets: [{ weight: 40, reps: 15 }, { weight: 60, reps: 10 }] }
    const progression = { reps: '15/10/10' }

    expect(suggestion(progression, 0, [], last)).toEqual({ weightKg: 40, reps: 15 })
    expect(suggestion(progression, 1, [], last)).toEqual({ weightKg: 60, reps: 10 })
    expect(suggestion(progression, 2, [], last)).toEqual({ weightKg: 60, reps: 10 })
    expect(suggestion(progression, 1, [set('x', 1, 42.5, 15)], last)).toEqual({ weightKg: 42.5, reps: 10 })
    expect(suggestion({ reps: 'falha' }, 0, [], undefined)).toEqual({ weightKg: 0, reps: 10 })
    expect(suggestion({ reps: 'falha' }, 1, [], last)).toEqual({ weightKg: 60, reps: 10 })
  })
})

describe('dates', () => {
  it('reads weekdays and adds days to API dates', () => {
    expect(weekdayOf('2026-09-28')).toBe(0) // Monday
    expect(weekdayOf('2026-10-04')).toBe(6)
    expect(addDays('2026-09-28', 4)).toBe('2026-10-02')
  })
})
