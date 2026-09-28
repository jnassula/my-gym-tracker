import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { CalendarScreen } from './calendar-screen'
import { ExerciseProgressScreen } from './exercise-progress-screen'
import { OverviewScreen } from './overview-screen'
import type { ExerciseProgress, ProgressCalendar, ProgressOverview, WeekComparison } from './types'
import { WeeksScreen } from './weeks-screen'

const fetchMock = vi.fn<typeof fetch>()

function serve(routes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input) => {
    const path = String(input)
    if (!(path in routes)) throw new Error(`Unexpected request: ${path}`)
    return json(routes[path])
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup() // before the session goes: screens under the app layout need it
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

const overview: ProgressOverview = {
  week_streak: 6,
  week_volume: 27800,
  records_this_month: 4,
  last_record: null,
  sets_by_group: [
    { muscle_group: 'quads', sets: 19 },
    { muscle_group: 'chest', sets: 15 },
  ],
  exercises: [
    {
      exercise_id: 'ex-squat',
      name: 'Agachamento Livre',
      muscle_group: 'quads',
      best_weight: 82.5,
      recent: [
        { date: '2026-09-09', weight: 70 },
        { date: '2026-09-16', weight: 77.5 },
        { date: '2026-09-23', weight: 82.5 },
      ],
      trend: 12.5,
      last_date: '2026-09-23',
    },
    {
      exercise_id: 'ex-row',
      name: 'Remada Curvada',
      muscle_group: 'back',
      best_weight: 52.5,
      recent: [
        { date: '2026-09-16', weight: 52.5 },
        { date: '2026-09-23', weight: 50 },
      ],
      trend: -2.5,
      last_date: '2026-09-23',
    },
  ],
}

describe('OverviewScreen', () => {
  it('shows the headline numbers, sets by group and each exercise’s trend', async () => {
    serve({ '/api/progress': overview })
    renderWithRouter(<OverviewScreen />)

    const streak = await screen.findByRole('link', { name: /6\s*semanas seguidas/ })
    expect(streak).toHaveAttribute('href', '/progress/calendar')
    expect(screen.getByRole('link', { name: /27,8 t\s*volume · semana/ })).toHaveAttribute('href', '/progress/weeks')
    expect(screen.getByText('PRs este mês')).toBeInTheDocument()
    expect(screen.getByText('19')).toBeInTheDocument()
    const squat = screen.getByRole('link', { name: /Agachamento Livre/ })
    expect(squat).toHaveAttribute('href', '/progress/exercises/ex-squat')
    expect(within(squat).getByText('Quadríceps · PR 82,5 kg')).toBeInTheDocument()
    expect(within(squat).getByLabelText('Tendência +12,5')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /Remada Curvada/ })).getByText('−2,5')).toBeInTheDocument()
  })

  it('invites to train when there is nothing yet', async () => {
    serve({ '/api/progress': { ...overview, week_streak: 0, sets_by_group: [], exercises: [] } })
    renderWithRouter(<OverviewScreen />)

    expect(await screen.findByText('Ainda sem progresso')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Treinar hoje' })).toHaveAttribute('href', '/')
  })
})

const progress: ExerciseProgress = {
  exercise_id: 'ex-squat',
  name: 'Agachamento Livre',
  muscle_group: 'quads',
  range: '3m',
  points: [
    { date: '2026-09-09', weight: 70 },
    { date: '2026-09-23', weight: 82.5 },
  ],
  best_weight: 82.5,
  volume: 9400,
  trend: 12.5,
  sessions: [
    { date: '2026-09-23', weight: 82.5, reps: 8, volume: 1980 },
    { date: '2026-09-09', weight: 70, reps: 10, volume: 2100 },
  ],
}

describe('ExerciseProgressScreen', () => {
  it('sums up the range and lists the latest sessions', async () => {
    serve({ '/api/progress/exercises/ex-squat?range=3m': progress })
    renderWithRouter(<ExerciseProgressScreen exerciseId="ex-squat" range="3m" onRangeChange={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'Agachamento Livre' })).toBeInTheDocument()
    expect(screen.getByText('Carga máxima por sessão')).toBeInTheDocument()
    expect(screen.getByText('82,5 kg')).toBeInTheDocument()
    expect(screen.getByText('9,4 t')).toBeInTheDocument()
    expect(screen.getByText('+12,5 kg')).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows.map((row) => row.textContent)).toEqual([
      'DataMelhorVolume',
      '23 set.82,5 × 81980 kg', // pt-PT groups from 5 digits
      '9 set.70 × 102100 kg',
    ])
  })

  it('switches range', async () => {
    const onRangeChange = vi.fn()
    serve({ '/api/progress/exercises/ex-squat?range=3m': progress })
    renderWithRouter(<ExerciseProgressScreen exerciseId="ex-squat" range="3m" onRangeChange={onRangeChange} />)

    const ranges = await screen.findByRole('group', { name: 'Período' })
    expect(within(ranges).getByRole('button', { name: '3 meses' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(ranges).getByRole('button', { name: '1 ano' }))

    expect(onRangeChange).toHaveBeenCalledWith('1y')
  })
})

const calendar: ProgressCalendar = {
  month: '2026-09-01',
  today: '2026-09-30',
  days: Array.from({ length: 30 }, (_, index) => {
    const day = index + 1
    const date = `2026-09-${String(day).padStart(2, '0')}`
    const status = day === 30 ? 'today' : day === 28 ? 'trained' : day === 2 ? 'missed' : 'rest'
    return { date, status } as const
  }),
  week_streak: 1,
  sessions_total: 1,
  adherence_30d: 0.125,
  this_week: [
    {
      session_id: 's1',
      date: '2026-09-28',
      weekday: 0,
      label: 'Quadríceps e Glúteos',
      duration_seconds: 3120,
      sets: 19,
      exercises_done: 8,
      exercises_total: 8,
    },
  ],
}

describe('CalendarScreen', () => {
  it('marks trained, missed and rest days and sums up the week', async () => {
    serve({ '/api/progress/calendar': calendar })
    renderWithRouter(<CalendarScreen month="" onMonthChange={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'setembro de 2026' })).toBeInTheDocument()
    expect(screen.getByText('13%')).toBeInTheDocument()
    expect(screen.getByLabelText('28 de setembro: treinado')).toBeInTheDocument()
    expect(screen.getByLabelText('2 de setembro: falhado')).toBeInTheDocument()
    expect(screen.getByLabelText('30 de setembro: hoje, por treinar')).toBeInTheDocument()
    expect(screen.getByText('Seg · Quadríceps e Glúteos')).toBeInTheDocument()
    expect(screen.getByText('52 min · 19 séries')).toBeInTheDocument()
    // The current month is the last one.
    expect(screen.getByRole('button', { name: 'Mês seguinte' })).toBeDisabled()
  })

  it('moves to the previous month', async () => {
    const onMonthChange = vi.fn()
    serve({ '/api/progress/calendar': calendar })
    renderWithRouter(<CalendarScreen month="" onMonthChange={onMonthChange} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Mês anterior' }))

    expect(onMonthChange).toHaveBeenCalledWith('2026-08-01')
  })
})

const weeks: WeekComparison = {
  week_start: '2026-09-28',
  iso_week: 40,
  last_iso_week: 39,
  until_weekday: 2,
  this_week: { volume: 27800, sets: 118, duration_seconds: 18720 },
  last_week: { volume: 26400, sets: 118, duration_seconds: 19800 },
  days: [
    { weekday: 0, this_week: 9800, last_week: 9000 },
    { weekday: 2, this_week: 4000, last_week: 10000 },
  ],
  today: {
    day_id: 'day-wed',
    label: 'Costas',
    exercises: [
      { exercise_id: 'a', name: 'Remada Articulada', last_week: 67.5, this_week: 70 },
      { exercise_id: 'b', name: 'Remada Curvada', last_week: 50, this_week: 50 },
      { exercise_id: 'c', name: 'Puxador Horizontal', last_week: 65, this_week: null },
    ],
  },
}

describe('WeeksScreen', () => {
  it('compares the totals like for like and today’s exercises', async () => {
    serve({ '/api/progress/weeks': weeks })
    renderWithRouter(<WeeksScreen />)

    expect(await screen.findByText('Semana 40 vs. 39')).toBeInTheDocument()
    expect(screen.getByText('+1,4 t · +5%')).toBeInTheDocument()
    expect(screen.getAllByText('=')).toHaveLength(2) // sets tile and one exercise
    expect(screen.getByText('−18 min')).toBeInTheDocument()
    expect(screen.getByText('Segunda a Quarta, nas duas semanas.')).toBeInTheDocument()
    const today = screen.getByRole('table')
    expect(within(today).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'ExercícioS39S40Δ',
      'Remada Articulada67,570+2,5',
      'Remada Curvada5050=',
      'Puxador Horizontal65—por fazer',
    ])
  })

  it('has a table view of the chart', async () => {
    serve({ '/api/progress/weeks': weeks })
    renderWithRouter(<WeeksScreen />)

    await userEvent.click(await screen.findByRole('button', { name: 'Ver valores' }))

    const [byDay] = screen.getAllByRole('table')
    expect(within(byDay).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'Diasemana 39semana 40',
      'Seg90009800',
      'Qua10\u00a00004000', // pt-PT: "10 000" with a no-break space
    ])
  })
})
