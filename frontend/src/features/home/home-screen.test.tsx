import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProgressOverview } from '@/features/progress/types'
import type { DayLog, PlanWeek, TrainingSession } from '@/features/training/types'
import type { Day, Exercise, Plan, PlanSummary, Weekday } from '@/features/workouts/types'
import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { HomeScreen } from './home-screen'

function exercise(id: string, name: string, fields: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name,
    position: 0,
    muscle_group: 'back',
    sets: 3,
    reps: '12',
    rest_seconds: 80,
    rest_max_seconds: null,
    notes: null,
    ...fields,
  }
}

const day = (id: string, weekday: Weekday, label: string, exercises: Exercise[] = []): Day => ({
  id,
  weekday,
  label,
  position: weekday,
  exercises,
})

const plan: Plan = {
  id: 'plan-1',
  name: 'Treino 01',
  is_active: true,
  valid_until: '2027-04-15',
  source_file_id: null,
  created_at: '2026-09-01T10:00:00Z',
  days: [
    day('day-mon', 0, 'Peito'),
    day('day-tue', 1, 'Pernas'),
    day('day-wed', 2, 'Costas (ênfase em remadas)', [
      exercise('ex-1', 'Esteira', { muscle_group: 'warmup', sets: null, reps: '30 min', rest_seconds: null }),
      exercise('ex-2', 'Remada Curvada'),
      exercise('ex-3', 'Puxador Horizontal'),
    ]),
    day('day-fri', 4, 'Ombros'),
  ],
}

const summary = { ...plan, weekdays: [0, 1, 2, 4], day_count: 4, exercise_count: 3, source_file: null } as PlanSummary

const week = (today: string, done: string[] = []): PlanWeek => ({
  today,
  week_start: '2026-09-28',
  days: done.map((id) => ({
    day_id: id,
    session_id: `s-${id}`,
    date: '2026-09-28',
    finished: true,
    exercises_done: 1,
    exercises_total: 1,
    sets: 3,
  })),
})

const overview: ProgressOverview = {
  week_streak: 6,
  week_volume: 27800,
  records_this_month: 4,
  last_record: { exercise_id: 'ex-9', name: 'Hack Horizontal Sentado', weight: 125, date: '2026-09-28' },
  sets_by_group: [],
  exercises: [],
}

function session(done: string[]): TrainingSession {
  return {
    id: 'session-1',
    day_id: 'day-wed',
    local_date: '2026-09-30',
    started_at: '2026-09-30T17:30:00Z',
    ended_at: null,
    done_exercise_ids: done,
    sets: [],
  }
}

const dayLog = (current: TrainingSession | null): DayLog => ({
  day_id: 'day-wed',
  today: '2026-09-30',
  session: current,
  last: {},
})

const fetchMock = vi.fn<typeof fetch>()

function serve(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected request: ${key}`)
    return handler()
  })
}

function serveActivePlan(today: string, current: TrainingSession | null = null) {
  serve({
    'GET /api/workouts': () => json([summary]),
    'GET /api/progress': () => json(overview),
    'GET /api/workouts/plan-1': () => json(plan),
    'GET /api/logs/plans/plan-1/week': () => json(week(today, ['day-mon', 'day-tue'])),
    'GET /api/logs/days/day-wed': () => json(dayLog(current)),
  })
}

beforeEach(() => {
  // Wednesday 30 September, 15:00 in Lisbon (the user's time zone).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T14:00:00Z'))
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('HomeScreen', () => {
  it('greets the user and shows today’s workout, the week and the numbers', async () => {
    serveActivePlan('2026-09-30')
    renderWithRouter(<HomeScreen />)

    expect(await screen.findByRole('heading', { name: 'Boa tarde, Jonata' })).toBeInTheDocument()
    expect(screen.getByText('Quarta, 30 de setembro')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/settings/profile')

    const today = await screen.findByRole('region', { name: 'Treino de hoje' })
    expect(within(today).getByText('Costas (ênfase em remadas)')).toBeInTheDocument()
    expect(await within(today).findByText('0/3 ex.')).toBeInTheDocument()
    expect(within(today).getByText('A seguir: Esteira · 30 min')).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Começar treino' })).toHaveAttribute(
      'href',
      '/workouts/plan-1/days/day-wed?from=home',
    )

    const week = screen.getByRole('region', { name: 'Esta semana' })
    expect(within(week).getByText('2/4 dias esta semana')).toBeInTheDocument()
    expect(within(week).getByRole('link', { name: 'Segunda, feito' })).toBeInTheDocument()
    expect(within(week).getByRole('link', { name: 'Quarta, Costas (ênfase em remadas), hoje' })).toHaveAttribute(
      'aria-current',
      'date',
    )
    expect(within(week).getByText('Quinta, descanso')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /27,8 t\s*volume · semana/ })).toHaveAttribute('href', '/progress/weeks')
    expect(screen.getByRole('link', { name: /Último recorde/ })).toHaveTextContent(
      'Hack Horizontal Sentado · 125 kg · Seg',
    )
    expect(screen.getByRole('link', { name: 'Plano “Treino 01” · trocar até 15 abr.' })).toHaveAttribute(
      'href',
      '/workouts/plan-1',
    )
  })

  it('carries on a workout already started', async () => {
    serveActivePlan('2026-09-30', session(['ex-1']))
    renderWithRouter(<HomeScreen />)

    const today = await screen.findByRole('region', { name: 'Treino de hoje' })
    expect(await within(today).findByText('1/3 ex.')).toBeInTheDocument()
    expect(within(today).getByText('A seguir: Remada Curvada · 3×12 · 1:20')).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Continuar treino' })).toBeInTheDocument()
  })

  it('points a rest day to the next workout', async () => {
    serveActivePlan('2026-10-01') // Thursday
    renderWithRouter(<HomeScreen />)

    const today = await screen.findByRole('region', { name: 'Treino de hoje' })
    expect(within(today).getByText('Hoje é dia de descanso')).toBeInTheDocument()
    expect(within(today).getByText('Próximo treino: Sexta · Ombros')).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Ver a semana' })).toHaveAttribute('href', '/workouts/plan-1')
  })

  it('asks for a PDF when there is no active plan', async () => {
    serve({
      'GET /api/workouts': () => json([]),
      'GET /api/progress': () => json({ ...overview, last_record: null }),
    })
    renderWithRouter(<HomeScreen />)

    expect(await screen.findByText('Sem treino para hoje')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Importar PDF' })).toHaveAttribute('href', '/workouts/import')
  })
})
