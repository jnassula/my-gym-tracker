import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProgressOverview } from '@/features/progress/types'
import type { DayLog, PlanWeek, Suggestion, TrainingSession } from '@/features/training/types'
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

/** The week on `today`: Monday's and Tuesday's workouts done on their days, unless said otherwise. */
function week(today: string, suggestion: Suggestion, trained: Record<string, string> = MON_TUE): PlanWeek {
  const started = suggestion.kind === 'continue' || suggestion.kind === 'done' ? suggestion.day_id : null
  const days = plan.days.map((item) => {
    const date = trained[item.id] ?? (item.id === started ? today : null)
    return {
      day_id: item.id,
      session_id: date ? `s-${item.id}` : null,
      date,
      finished: item.id in trained || suggestion.kind === 'done',
      exercises_done: item.id in trained ? item.exercises.length : 1,
      exercises_total: item.exercises.length,
      sets: 0,
      trained: item.id in trained || (item.id === started && suggestion.kind === 'done'),
    }
  })
  return {
    today,
    week_start: '2026-09-28',
    days,
    target: plan.days.length,
    workouts_done: days.filter((item) => item.trained).length,
    sessions: days
      .filter((item) => item.date)
      .map((item) => ({
        session_id: `s-${item.day_id}`,
        day_id: item.day_id,
        date: item.date ?? today,
        complete: item.trained,
      })),
    suggestion,
  }
}

const MON_TUE = { 'day-mon': '2026-09-28', 'day-tue': '2026-09-29' }
const SUGGEST_WED: Suggestion = { kind: 'suggest', day_id: 'day-wed', reason: 'plan' }

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

function serveActivePlan(of: PlanWeek | object, current: TrainingSession | null = null) {
  serve({
    'GET /api/workouts': () => json([summary]),
    'GET /api/progress': () => json(overview),
    'GET /api/workouts/plan-1': () => json(plan),
    'GET /api/logs/plans/plan-1/week': () => json(of),
    'GET /api/logs/days/day-wed': () => json(dayLog(current)),
    'PUT /api/logs/days/day-wed/done': () => json({ ...session(['ex-1', 'ex-2', 'ex-3']), ended_at: '2026-09-30T14:00:00Z' }),
  })
}

const requested = (key: string) =>
  fetchMock.mock.calls.filter(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key).length

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
  const todayCard = () => screen.findByRole('region', { name: 'Treino de hoje' })

  it('greets the user and shows today’s workout, the week and the numbers', async () => {
    serveActivePlan(week('2026-09-30', SUGGEST_WED))
    renderWithRouter(<HomeScreen />)

    expect(await screen.findByRole('heading', { name: 'Boa tarde, Jonata' })).toBeInTheDocument()
    expect(screen.getByText('Quarta, 30 de setembro')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/settings/profile')

    const today = await todayCard()
    expect(within(today).getByText('Costas (ênfase em remadas)')).toBeInTheDocument()
    expect(await within(today).findByText('0/3 ex.')).toBeInTheDocument()
    expect(within(today).getByText('É o treino de hoje no plano.')).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Começar treino' })).toHaveAttribute(
      'href',
      '/workouts/plan-1/days/day-wed?from=home',
    )

    const thisWeek = screen.getByRole('region', { name: 'Esta semana' })
    expect(within(thisWeek).getByText('2 de 4 treinos')).toBeInTheDocument()
    // A day already trained opens what was done on it; today's opens the workout itself.
    expect(within(thisWeek).getByRole('link', { name: 'Segunda, feito, Peito' })).toHaveAttribute(
      'href',
      '/progress/sessions/s-day-mon',
    )
    const wednesday = within(thisWeek).getByRole('link', {
      name: 'Quarta, por fazer, Costas (ênfase em remadas), hoje',
    })
    expect(wednesday).toHaveAttribute('aria-current', 'date')
    expect(wednesday).toHaveAttribute('href', '/workouts/plan-1/days/day-wed?from=home')
    expect(within(thisWeek).getByText('Quinta, sem treino')).toBeInTheDocument()
    expect(within(thisWeek).getByText('Sexta, por fazer, Ombros')).toBeInTheDocument()

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
    serveActivePlan(week('2026-09-30', { kind: 'continue', day_id: 'day-wed', reason: null }), session(['ex-1']))
    renderWithRouter(<HomeScreen />)

    const today = await todayCard()
    expect(await within(today).findByText('1/3 ex.')).toBeInTheDocument()
    expect(within(today).getByText('A seguir: Remada Curvada · 3×12 · 1:20')).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Continuar treino' })).toBeInTheDocument()
  })

  it('says why a workout from another weekday is today’s', async () => {
    // Thursday: Wednesday's workout wasn't done.
    serveActivePlan(week('2026-10-01', { kind: 'suggest', day_id: 'day-wed', reason: 'catch_up' }))
    renderWithRouter(<HomeScreen />)

    const today = await todayCard()
    expect(await within(today).findByText('Ficou por fazer esta semana.')).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Começar treino' })).toBeInTheDocument()
    // Nothing on the screen calls Wednesday missed.
    expect(screen.getByText('Quarta, sem treino')).toBeInTheDocument()
  })

  it('still shows the workout when the server gives a reason this app has no words for', async () => {
    serveActivePlan(week('2026-09-30', { kind: 'suggest', day_id: 'day-wed', reason: 'before_activity' }))
    renderWithRouter(<HomeScreen />)

    const today = await todayCard()
    expect(await within(today).findByText('A seguir: Esteira · 30 min')).toBeInTheDocument()
  })

  it('lets another workout be chosen for today', async () => {
    serveActivePlan(week('2026-09-30', SUGGEST_WED))
    renderWithRouter(<HomeScreen />)

    await userEvent.click(within(await todayCard()).getByRole('button', { name: 'Trocar o treino de hoje' }))

    const sheet = await screen.findByRole('dialog', { name: 'Que treino hoje?' })
    const rows = within(sheet).getAllByRole('link')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Peito0 ex. · feito seg, 28 set.',
      'Pernas0 ex. · feito ter, 29 set.',
      'Costas (ênfase em remadas)sugerido3 ex. · por fazer',
      'Ombros0 ex. · por fazer',
    ])
    expect(rows[3]).toHaveAttribute('href', '/workouts/plan-1/days/day-fri?from=home')
    expect(rows[0]).toHaveAttribute('href', '/workouts/plan-1/days/day-mon?from=home') // again, if wanted
  })

  it('marks today’s workout as done with one tap', async () => {
    serveActivePlan(week('2026-09-30', SUGGEST_WED))
    renderWithRouter(<HomeScreen />)
    const today = await todayCard()
    await within(today).findByText('0/3 ex.')

    await userEvent.click(
      within(today).getByRole('button', { name: 'Marcar Costas (ênfase em remadas) como feito' }),
    )

    await waitFor(() => expect(requested('PUT /api/logs/days/day-wed/done')).toBe(1))
    expect(await within(today).findByText('3/3 ex.')).toBeInTheDocument() // the day's log, as answered
    await waitFor(() => expect(requested('GET /api/logs/plans/plan-1/week')).toBe(2)) // and the week again
  })

  it('offers another workout once today’s is done', async () => {
    serveActivePlan(
      week('2026-09-30', { kind: 'done', day_id: 'day-wed', reason: null }),
      { ...session(['ex-1', 'ex-2', 'ex-3']), ended_at: '2026-09-30T13:00:00Z' },
    )
    renderWithRouter(<HomeScreen />)

    const today = await todayCard()
    expect(await within(today).findByText('Treino de hoje feito.')).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Ver treino' })).toBeInTheDocument()
    expect(within(today).getByRole('button', { name: 'Fazer outro treino' })).toBeInTheDocument()
    expect(within(today).queryByRole('button', { name: /como feito/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quarta, feito, Costas (ênfase em remadas), hoje' })).toBeInTheDocument()
  })

  it('is quiet on a day with nothing due, and still lets a workout be chosen', async () => {
    serveActivePlan(
      week('2026-10-01', { kind: 'rest', day_id: 'day-fri', reason: null }, { ...MON_TUE, 'day-wed': '2026-09-30' }),
    )
    renderWithRouter(<HomeScreen />)

    const today = await todayCard()
    expect(within(today).getByText('Hoje não há treino no plano')).toBeInTheDocument()
    expect(within(today).getByText('A seguir: Ombros, Sexta.')).toBeInTheDocument()
    await userEvent.click(within(today).getByRole('button', { name: 'Escolher treino' }))
    const sheet = await screen.findByRole('dialog', { name: 'Que treino hoje?' })
    expect(within(sheet).getByRole('link', { name: /Ombros/ })).toHaveTextContent('sugerido')
  })

  it('says so when the week’s workouts are done', async () => {
    const all = { ...MON_TUE, 'day-wed': '2026-09-30', 'day-fri': '2026-09-30' }
    serveActivePlan(week('2026-10-01', { kind: 'complete', day_id: 'day-mon', reason: null }, all))
    renderWithRouter(<HomeScreen />)

    const today = await todayCard()
    expect(within(today).getByText('Semana completa')).toBeInTheDocument()
    expect(within(today).getByText('4 de 4 treinos feitos. Descansa, ou faz mais um.')).toBeInTheDocument()
    expect(within(today).getByRole('button', { name: 'Fazer outro treino' })).toBeInTheDocument()
    expect(screen.getByText('4 de 4 treinos')).toBeInTheDocument()
  })

  it('gets by with a server from before the flexible week', async () => {
    const { target: _target, workouts_done: _done, sessions: _sessions, suggestion: _suggestion, ...older } = week(
      '2026-09-30',
      SUGGEST_WED,
    )
    serveActivePlan({ ...older, days: older.days.map(({ trained: _trained, ...item }) => item) })
    renderWithRouter(<HomeScreen />)

    const today = await todayCard()
    expect(within(today).getByText('Podes descansar, ou adiantar um treino.')).toBeInTheDocument()
    expect(within(today).getByRole('button', { name: 'Escolher treino' })).toBeInTheDocument()
    expect(screen.getByText('2 de 4 treinos')).toBeInTheDocument() // counted from the days it does send
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
