import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Day, Plan, Weekday } from '@/features/workouts/types'
import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { PlanWeekScreen } from './plan-week'
import type { DayWeek, PlanWeek, Suggestion } from './types'

const day = (id: string, weekday: Weekday | null, label: string): Day => ({
  id,
  weekday,
  label,
  position: 0,
  exercises: [
    {
      id: `${id}-1`,
      name: 'Prancha',
      position: 0,
      muscle_group: 'abs',
      sets: 3,
      reps: '30 s',
      rest_seconds: 60,
      rest_max_seconds: null,
      notes: null,
    },
  ],
})

const plan = (days: Day[]): Plan => ({
  id: 'plan-1',
  name: 'Treino 01',
  is_active: true,
  valid_until: null,
  source_file_id: null,
  created_at: '2026-09-01T10:00:00Z',
  days,
})

const status = (id: string, date: string | null, trained: boolean): DayWeek => ({
  day_id: id,
  session_id: date ? `s-${id}` : null,
  date,
  finished: trained,
  exercises_done: trained ? 1 : 0,
  exercises_total: 1,
  sets: 0,
  trained,
  avoid: [],
})

function week(days: DayWeek[], suggestion: Suggestion): PlanWeek {
  return {
    today: '2026-09-30', // Wednesday
    week_start: '2026-09-28',
    days,
    target: days.length,
    workouts_done: days.filter((item) => item.trained).length,
    sessions: [],
    suggestion,
    activities: [],
  }
}

const fetchMock = vi.fn<typeof fetch>()

function serve(of: Plan, state: PlanWeek) {
  fetchMock.mockImplementation(async (input) => {
    if (String(input) === '/api/workouts/plan-1') return json(of)
    if (String(input) === '/api/logs/plans/plan-1/week') return json(state)
    throw new Error(`Unexpected request: ${String(input)}`)
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

describe('PlanWeekScreen', () => {
  const rows = async () => within(await screen.findByRole('list')).getAllByRole('link')

  it('lists the plan’s workouts with how each stands this week, not a calendar of weekdays', async () => {
    const fixed = plan([day('mon', 0, 'Peito'), day('wed', 2, 'Costas'), day('fri', 4, 'Pernas')])
    // Friday's workout was done on Monday; Monday's is the one in hand on this Wednesday.
    serve(
      fixed,
      week(
        [status('mon', '2026-09-30', false), status('wed', null, false), status('fri', '2026-09-28', true)],
        { kind: 'continue', day_id: 'mon', reason: null, because: [] },
      ),
    )
    renderWithRouter(<PlanWeekScreen planId="plan-1" />)

    const [monday, wednesday, friday] = await rows()
    expect(monday).toHaveTextContent('SegPeitoHoje · 0/1 feito')
    expect(wednesday).toHaveTextContent('QuaCostas1 ex.')
    expect(friday).toHaveTextContent('SexPernas1 ex. · feito seg, 28 set.')
    expect(within(friday).getByLabelText('Feito')).toBeInTheDocument()
    expect(within(monday).getByLabelText('Hoje')).toBeInTheDocument()
    expect(monday).toHaveAttribute('href', '/workouts/plan-1/days/mon')
    expect(screen.getByRole('progressbar', { name: '1 de 3 treinos esta semana' })).toBeInTheDocument()
    expect(screen.queryByText('Dia de descanso')).not.toBeInTheDocument()
  })

  it('points at the workout suggested for today', async () => {
    const fixed = plan([day('mon', 0, 'Peito'), day('wed', 2, 'Costas')])
    serve(
      fixed,
      week([status('mon', '2026-09-28', true), status('wed', null, false)], {
        kind: 'suggest',
        day_id: 'wed',
        reason: 'plan', because: []
      }),
    )
    renderWithRouter(<PlanWeekScreen planId="plan-1" />)

    const [, wednesday] = await rows()
    expect(within(wednesday).getByLabelText('Sugerido para hoje')).toBeInTheDocument()
  })

  it('shows a plan that rotates its days without weekdays', async () => {
    const rotating = plan([day('a', null, 'Treino A'), day('b', null, 'Treino B')])
    serve(
      rotating,
      week([status('a', '2026-09-29', true), status('b', null, false)], {
        kind: 'suggest',
        day_id: 'b',
        reason: 'next', because: []
      }),
    )
    renderWithRouter(<PlanWeekScreen planId="plan-1" />)

    const [a, b] = await rows()
    expect(a).toHaveTextContent('Treino A1 ex. · feito ter, 29 set.')
    expect(b).toHaveTextContent('Treino B1 ex.')
    expect(screen.queryByText(/Sem dia/)).not.toBeInTheDocument()
  })
})
