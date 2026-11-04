import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Exercise, Plan } from '@/features/workouts/types'
import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { DayScreen } from './day-screen'
import { ExerciseScreen } from './exercise-screen'
import { restTimer } from './rest-timer'
import type { DayLog, LoggedSet, PlanWeek, TrainingSession } from './types'

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

const plan: Plan = {
  id: 'plan-1',
  name: 'Treino 01',
  is_active: true,
  valid_until: null,
  source_file_id: null,
  created_at: '2026-09-28T10:00:00Z',
  days: [
    {
      id: 'day-1',
      weekday: 2,
      label: 'Costas (ênfase em remadas)',
      position: 0,
      exercises: [
        exercise('ex-1', 'Esteira', { muscle_group: 'warmup', sets: null, reps: '30 min', rest_seconds: null }),
        exercise('ex-2', 'Remada Curvada'),
        exercise('ex-3', 'Puxador Horizontal', { reps: '8-10', rest_seconds: 120 }),
      ],
    },
  ],
}

function loggedSet(n: number, weight: number, reps: number, exerciseId = 'ex-2'): LoggedSet {
  return {
    id: `set-${exerciseId}-${n}`,
    exercise_id: exerciseId,
    set_number: n,
    weight,
    reps,
    performed_at: '2026-09-30T18:00:00Z',
  }
}

function session(sets: LoggedSet[], done: string[] = []): TrainingSession {
  return {
    id: 'session-1',
    day_id: 'day-1',
    local_date: '2026-09-30',
    started_at: '2026-09-30T17:30:00Z',
    ended_at: null,
    done_exercise_ids: done,
    sets,
  }
}

function dayLog(current: TrainingSession | null): DayLog {
  return {
    day_id: 'day-1',
    today: '2026-09-30',
    session: current,
    last: { 'ex-2': { date: '2026-09-23', sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 11 }] } },
  }
}

type Handler = (body: unknown) => Response
const fetchMock = vi.fn<typeof fetch>()

/** Answers `"METHOD /path"` requests from a table; anything else fails the test. An exercise
 * has no animation unless the table says so. */
function serve(routes: Record<string, Handler>) {
  fetchMock.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    const handler = routes[key] ?? (key.startsWith('GET /api/demos/exercises/') ? () => json(null) : undefined)
    if (!handler) throw new Error(`Unexpected request: ${key}`)
    return handler(init?.body ? JSON.parse(String(init.body)) : undefined)
  })
}

const requests = (key: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined))

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup() // before the session goes: screens under the app layout need it
  restTimer.skip()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

describe('ExerciseScreen', () => {
  const onNextExercise = vi.fn()
  function renderExercise() {
    renderWithRouter(
      <ExerciseScreen plan={plan} dayId="day-1" exerciseId="ex-2" backLink={null} onNextExercise={onNextExercise} />,
    )
  }

  it('starts from last time’s weight and the plan’s reps', async () => {
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(null)),
      'GET /api/logs/exercises/ex-2/history': () =>
        json({ sessions: [dayLog(null).last['ex-2']], best_weight: 50 }),
    })
    renderExercise()

    expect(await screen.findByLabelText('Carga atual em kg')).toHaveValue('50')
    expect(screen.getByText('Última 50 kg')).toBeInTheDocument()
    expect(screen.getByText('igual à última sessão')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registar série · 50 kg × 12' })).toBeInTheDocument()
    expect(await screen.findByText('50 × 12 · 50 × 11')).toBeInTheDocument()
    expect(screen.getByText('PR 50 kg')).toBeInTheDocument()
  })

  it('steps the weight up or down in the user’s unit', async () => {
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(null)),
      'GET /api/logs/exercises/ex-2/history': () => json({ sessions: [], best_weight: null }),
    })
    renderExercise()
    const input = await screen.findByLabelText('Carga atual em kg')

    await userEvent.click(screen.getByRole('button', { name: '+5' }))
    expect(input).toHaveValue('55')
    expect(screen.getByText('+5 kg vs. última')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '− diminuir' }))
    await userEvent.click(screen.getByRole('button', { name: '−10' }))
    expect(input).toHaveValue('45')
    expect(screen.getByText('−5 kg vs. última')).toBeInTheDocument()

    await userEvent.clear(input)
    await userEvent.type(input, '47,5')
    expect(screen.getByRole('button', { name: 'Registar série · 47,5 kg × 12' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Usar última' }))
    expect(input).toHaveValue('50')
  })

  it('logs a set in kg and starts the rest with what comes next', async () => {
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(null)),
      'GET /api/logs/exercises/ex-2/history': () => json({ sessions: [], best_weight: 50 }),
      'POST /api/logs/exercises/ex-2/sets': () => json(session([loggedSet(1, 52.5, 12)]), 201),
    })
    renderExercise()

    await userEvent.click(await screen.findByRole('button', { name: 'Registar série · 50 kg × 12' }))
    const sheet = await screen.findByRole('dialog', { name: 'Registar série #1' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mais carga' }))
    await userEvent.click(within(sheet).getByRole('button', { name: /Confirmar/ }))

    await waitFor(() => expect(requests('POST /api/logs/exercises/ex-2/sets')).toEqual([{ weight: 52.5, reps: 12 }]))
    const rest = await screen.findByRole('dialog', { name: 'Descanso' })
    expect(within(rest).getByRole('timer')).toHaveTextContent('1:20')
    expect(within(rest).getByText('A seguir: Remada Curvada #2')).toBeInTheDocument()
    expect(restTimer.get().total).toBe(80)

    await userEvent.click(within(rest).getByRole('button', { name: 'Saltar descanso' }))
    expect(await screen.findByRole('button', { name: 'Série 1: 52,5 kg × 12. Tocar para corrigir' })).toBeInTheDocument()
    expect(restTimer.get().endsAt).toBeNull()
  })

  it('offers the next set once the rest has run out', async () => {
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(null)),
      'GET /api/logs/exercises/ex-2/history': () => json({ sessions: [], best_weight: 50 }),
      'POST /api/logs/exercises/ex-2/sets': () => json(session([loggedSet(1, 50, 12)]), 201),
    })
    renderExercise()
    await userEvent.click(await screen.findByRole('button', { name: 'Registar série · 50 kg × 12' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Registar série #1' })).getByRole('button', { name: /Confirmar/ }))
    const rest = await screen.findByRole('dialog', { name: 'Descanso' })
    expect(within(rest).queryByRole('button', { name: 'Próxima série' })).not.toBeInTheDocument()

    act(() => restTimer.adjust(-80)) // the rest runs out

    expect(await within(rest).findByText('Pronto — próxima série')).toBeInTheDocument()
    expect(within(rest).queryByRole('button', { name: 'Saltar descanso' })).not.toBeInTheDocument()
    await userEvent.click(within(rest).getByRole('button', { name: 'Próxima série' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descanso' })).not.toBeInTheDocument())
    expect(onNextExercise).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Registar série · 50 kg × 12' })).toBeInTheDocument()
  })

  it('opens the next exercise once the rest after the last set has run out', async () => {
    const done = [loggedSet(1, 50, 12), loggedSet(2, 50, 12), loggedSet(3, 50, 12)]
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(session(done.slice(0, 2)))),
      'GET /api/logs/exercises/ex-2/history': () => json({ sessions: [], best_weight: 50 }),
      'POST /api/logs/exercises/ex-2/sets': () => json(session(done), 201),
    })
    renderExercise()
    await userEvent.click(await screen.findByRole('button', { name: /Registar série · 50 kg/ }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Registar série #3' })).getByRole('button', { name: /Confirmar/ }))
    const rest = await screen.findByRole('dialog', { name: 'Descanso' })
    expect(within(rest).getByText('A seguir: Puxador Horizontal')).toBeInTheDocument()

    act(() => restTimer.adjust(-80))

    await userEvent.click(await within(rest).findByRole('button', { name: 'Próximo exercício' }))
    expect(onNextExercise).toHaveBeenCalledWith('ex-3')
    expect(restTimer.get().endsAt).toBeNull()
  })

  it('corrects a logged set', async () => {
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(session([loggedSet(1, 50, 12)]))),
      'GET /api/logs/exercises/ex-2/history': () => json({ sessions: [], best_weight: 50 }),
      'PATCH /api/logs/sets/set-ex-2-1': () => json(session([loggedSet(1, 50, 10)])),
    })
    renderExercise()

    await userEvent.click(await screen.findByRole('button', { name: /Série 1: 50 kg × 12/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Corrigir série #1' })
    await userEvent.clear(within(dialog).getByLabelText('Repetições'))
    await userEvent.type(within(dialog).getByLabelText('Repetições'), '10')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(requests('PATCH /api/logs/sets/set-ex-2-1')).toEqual([{ weight: 50, reps: 10 }]))
    expect(await screen.findByRole('button', { name: /Série 1: 50 kg × 10/ })).toBeInTheDocument()
  })
})

describe('ExerciseScreen without automatic rest', () => {
  it('logs a set without starting the rest', async () => {
    sessionStore.set({ accessToken: 'access-1', user: { ...user, auto_rest: false } })
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(null)),
      'GET /api/logs/exercises/ex-2/history': () => json({ sessions: [], best_weight: 50, recent: [] }),
      'POST /api/logs/exercises/ex-2/sets': () => json(session([loggedSet(1, 50, 12)]), 201),
    })
    renderWithRouter(<ExerciseScreen plan={plan} dayId="day-1" exerciseId="ex-2" backLink={null} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Registar série · 50 kg × 12' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Confirmar/ }))

    expect(await screen.findByRole('button', { name: /Série 1: 50 kg × 12/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Descanso' })).not.toBeInTheDocument()
    expect(restTimer.get().endsAt).toBeNull()
  })
})

describe('ExerciseScreen extras', () => {
  it('links its progression and works out the plates', async () => {
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(null)),
      'GET /api/logs/exercises/ex-2/history': () =>
        json({
          sessions: [],
          best_weight: 50,
          recent: [
            { date: '2026-09-16', weight: 47.5 },
            { date: '2026-09-23', weight: 50 },
          ],
        }),
    })
    renderWithRouter(<ExerciseScreen plan={plan} dayId="day-1" exerciseId="ex-2" backLink={null} />)

    const progression = await screen.findByRole('link', { name: /Progressão/ })
    expect(progression).toHaveAttribute('href', '/progress/exercises/ex-2')
    expect(await within(progression).findByText('2 sessões · desde 47,5 kg')).toBeInTheDocument()
    expect(within(progression).getByText('PR 50 kg')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Anilhas' }))
    const sheet = await screen.findByRole('dialog', { name: 'Anilhas por lado · 50 kg' })
    expect(within(sheet).getByText('1 × 15')).toBeInTheDocument() // (50 − 20) / 2
    await userEvent.click(within(sheet).getByRole('button', { name: '15 kg' }))
    expect(within(sheet).getByText('1 × 2,5')).toBeInTheDocument() // (50 − 15) / 2 = 15 + 2,5
  })
})

describe('DayScreen', () => {
  it('lists the day by muscle group with what is done', async () => {
    serve({ 'GET /api/logs/days/day-1': () => json(dayLog(session([loggedSet(1, 50, 12)], ['ex-1']))) })
    renderWithRouter(<DayScreen plan={plan} dayId="day-1" fromHome />)

    expect(await screen.findByRole('progressbar', { name: '1 de 3 exercícios feitos' })).toBeInTheDocument()
    expect(screen.getByText('Quarta · Hoje')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Aquecimento' })).toBeInTheDocument()
    expect(screen.getByText('3×12 · 1:20 · 50 kg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desmarcar Esteira' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ticks an exercise off by hand', async () => {
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(null)),
      'PUT /api/logs/exercises/ex-3/done': () => json(session([], ['ex-3'])),
    })
    renderWithRouter(<DayScreen plan={plan} dayId="day-1" fromHome />)

    await userEvent.click(await screen.findByRole('button', { name: 'Marcar Puxador Horizontal como feito' }))

    expect(await screen.findByRole('progressbar', { name: '1 de 3 exercícios feitos' })).toBeInTheDocument()
  })

  it('finishes the workout with a summary', async () => {
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(session([loggedSet(1, 55, 12)]))),
      'POST /api/logs/sessions/session-1/finish': () =>
        json({
          session_id: 'session-1',
          sets: 1,
          volume: 660,
          duration_seconds: 3120,
          records: [{ exercise_id: 'ex-2', name: 'Remada Curvada', weight: 55 }],
        }),
    })
    renderWithRouter(<DayScreen plan={plan} dayId="day-1" fromHome />)

    await userEvent.click(await screen.findByRole('button', { name: 'Terminar treino' }))

    const summary = await screen.findByRole('dialog', { name: 'Costas (ênfase em remadas)' })
    expect(within(summary).getByText('Treino concluído')).toBeInTheDocument()
    expect(within(summary).getByText('660 kg')).toBeInTheDocument()
    expect(within(summary).getByText('52:00')).toBeInTheDocument()
    expect(within(summary).getByText('Novo PR: Remada Curvada — 55 kg')).toBeInTheDocument()
  })

  it('cannot finish before anything was logged', async () => {
    serve({ 'GET /api/logs/days/day-1': () => json(dayLog(null)) })
    renderWithRouter(<DayScreen plan={plan} dayId="day-1" />)

    expect(await screen.findByRole('button', { name: 'Terminar treino' })).toBeDisabled()
    // Not today's workout yet: the plan's weekday is only where the trainer put it.
    expect(screen.getByText('Quarta')).toBeInTheDocument()
    expect(screen.queryByText('Quarta · Hoje')).not.toBeInTheDocument()
  })

  it('marks the whole workout as done without logging a set', async () => {
    const done = { ...session([], ['ex-1', 'ex-2', 'ex-3']), ended_at: '2026-09-30T18:00:00Z' }
    serve({
      'GET /api/logs/days/day-1': () => json(dayLog(null)),
      'PUT /api/logs/days/day-1/done': () => json(done),
    })
    renderWithRouter(<DayScreen plan={plan} dayId="day-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Marcar treino como feito' }))

    await waitFor(() => expect(requests('PUT /api/logs/days/day-1/done')).toHaveLength(1))
    // No summary to show (nothing was lifted): the screen moves on, and a toast offers the way back.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers no marking once the workout is complete', async () => {
    const done = { ...session([], ['ex-1', 'ex-2', 'ex-3']), ended_at: '2026-09-30T18:00:00Z' }
    serve({ 'GET /api/logs/days/day-1': () => json(dayLog(done)) })
    renderWithRouter(<DayScreen plan={plan} dayId="day-1" />)

    expect(await screen.findByRole('progressbar', { name: '3 de 3 exercícios feitos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar treino como feito' })).not.toBeInTheDocument()
  })

  it('says when the workout was already done on another day this week', async () => {
    serve({ 'GET /api/logs/days/day-1': () => json(dayLog(null)) })
    const week: PlanWeek = {
      today: '2026-09-30',
      week_start: '2026-09-28',
      days: [
        {
          day_id: 'day-1',
          session_id: 'session-0',
          date: '2026-09-28',
          finished: true,
          exercises_done: 3,
          exercises_total: 3,
          sets: 9,
          trained: true,
          avoid: [],
        },
      ],
      target: 1,
      workouts_done: 1,
      sessions: [{ session_id: 'session-0', day_id: 'day-1', date: '2026-09-28', complete: true }],
      suggestion: { kind: 'complete', day_id: 'day-1', reason: null, because: [] },
      activities: [],
    }
    renderWithRouter(<DayScreen plan={plan} dayId="day-1" week={week} />)

    expect(await screen.findByText(/Feito esta semana: seg, 28 set\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver esse treino' })).toHaveAttribute(
      'href',
      '/progress/sessions/session-0',
    )
    // It can still be done again today.
    expect(screen.getByRole('button', { name: 'Marcar treino como feito' })).toBeEnabled()
  })

  it('a rotating plan’s day has no weekday to show, only "Hoje" once it is today’s', async () => {
    const rotating: Plan = {
      ...plan,
      days: [{ ...plan.days[0], weekday: null, label: 'Treino B' }],
    }
    serve({ 'GET /api/logs/days/day-1': () => json(dayLog(session([], ['ex-1']))) })
    renderWithRouter(<DayScreen plan={rotating} dayId="day-1" />)

    expect(await screen.findByRole('heading', { name: 'Treino B' })).toBeInTheDocument()
    expect(await screen.findByText('Hoje')).toBeInTheDocument()
    expect(screen.queryByText(/Sem dia/)).not.toBeInTheDocument()
  })
})
