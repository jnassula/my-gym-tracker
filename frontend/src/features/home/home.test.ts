import { describe, expect, it } from 'vitest'

import type { DayWeek, PlanWeek, TrainingSession } from '@/features/training/types'
import type { Day, Exercise, Weekday } from '@/features/workouts/types'

import { firstName, greetingFor, localNow, nextToDo, weekStrip } from './home'

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
  const status = (id: string, date: string | null, trained: boolean): DayWeek => ({
    day_id: id,
    session_id: date ? `s-${id}` : null,
    date,
    finished: trained,
    exercises_done: trained ? 5 : 0,
    exercises_total: 5,
    sets: 0,
    trained,
  })
  // Wednesday. Monday's workout was done on Tuesday, and Friday's on Monday.
  const week: PlanWeek = {
    today: '2026-09-30',
    week_start: '2026-09-28',
    days: [
      status('mon', '2026-09-29', true),
      status('tue', null, false),
      status('wed', null, false),
      status('fri', '2026-09-28', true),
      status('sat', null, false),
    ],
    target: 5,
    workouts_done: 2,
    sessions: [
      { session_id: 's-fri', day_id: 'fri', date: '2026-09-28', complete: true },
      { session_id: 's-mon', day_id: 'mon', date: '2026-09-29', complete: false }, // left half done
    ],
    suggestion: { kind: 'suggest', day_id: 'wed', reason: 'plan' },
  }
  const cells = (of: PlanWeek) => weekStrip(days, of).map((cell) => [cell.state, cell.day?.id ?? null, cell.sessionId])

  it('says what was trained on each date, whatever the plan had there', () => {
    expect(cells(week)).toEqual([
      ['trained', 'fri', 's-fri'], // Monday: Friday's workout
      ['trained', 'mon', 's-mon'], // Tuesday: an earlier day counts as it was left
      ['planned', 'wed', null], // today: the one suggested
      ['idle', null, null],
      ['idle', null, null], // Friday's is done already: nothing is waiting there
      ['planned', 'sat', null],
      ['idle', null, null],
    ])
    expect(weekStrip(days, week).map((cell) => cell.isToday)).toEqual([false, false, true, false, false, false, false])
  })

  it('never calls a day gone by missed', () => {
    const untouched = { ...week, days: week.days.map((item) => status(item.day_id, null, false)), sessions: [] }

    expect(cells(untouched).slice(0, 2)).toEqual([
      ['idle', null, null], // Monday and Tuesday had workouts in the plan and none was done:
      ['idle', null, null], // days like any other, and the week's count says the rest
    ])
  })

  it('shows today’s workout as trained only once it is complete', () => {
    const started = {
      ...week,
      sessions: [...week.sessions, { session_id: 's-wed', day_id: 'wed', date: '2026-09-30', complete: false }],
      suggestion: { kind: 'continue', day_id: 'wed', reason: null },
    } satisfies PlanWeek
    const done = {
      ...started,
      sessions: started.sessions.map((item) => ({ ...item, complete: true })),
      suggestion: { kind: 'done', day_id: 'wed', reason: null },
    } satisfies PlanWeek

    expect(cells(started)[2]).toEqual(['planned', 'wed', null])
    expect(cells(done)[2]).toEqual(['trained', 'wed', 's-wed'])
  })

  it('has nothing waiting today on a rest day or in a week already complete', () => {
    for (const kind of ['rest', 'complete'] as const) {
      expect(cells({ ...week, suggestion: { kind, day_id: 'sat', reason: null } })[2]).toEqual(['idle', null, null])
    }
  })

  it('lays out a plan that rotates its days by what was trained alone', () => {
    const rotating = [day('a', null), day('b', null)]
    const of: PlanWeek = {
      ...week,
      days: [status('a', '2026-09-28', true), status('b', null, false)],
      sessions: [{ session_id: 's-a', day_id: 'a', date: '2026-09-28', complete: true }],
      suggestion: { kind: 'suggest', day_id: 'b', reason: 'next' },
    }

    expect(weekStrip(rotating, of).map((cell) => cell.state)).toEqual([
      'trained',
      'idle',
      'planned', // today
      'idle',
      'idle',
      'idle',
      'idle',
    ])
  })

  it('opens another plan’s workout by its session alone', () => {
    const of: PlanWeek = {
      ...week,
      sessions: [{ session_id: 's-old', day_id: 'gone', date: '2026-09-28', complete: true }],
    }

    expect(cells(of)[0]).toEqual(['trained', null, 's-old'])
  })
})
