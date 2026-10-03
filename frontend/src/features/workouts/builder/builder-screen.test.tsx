import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import type { Plan, PlanCreate, PlanSummary } from '../types'
import { BuilderScreen } from './builder-screen'
import type { BuilderSearch } from './search'
import { DRAFT_KEY, loadDraft } from './storage'

const fetchMock = vi.fn<typeof fetch>()

function serve(routes: Record<string, (body: unknown) => Response>) {
  fetchMock.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected request: ${key}`)
    return handler(init?.body ? JSON.parse(String(init.body)) : undefined)
  })
}

const posted = () =>
  fetchMock.mock.calls
    .filter(([input, init]) => init?.method === 'POST' && String(input) === '/api/workouts')
    .map(([, init]) => JSON.parse(String(init?.body)) as PlanCreate)

const summary: PlanSummary = {
  id: 'plan-1',
  name: 'Treino 01',
  is_active: true,
  valid_until: null,
  source_file_id: 'file-1',
  source_file: { id: 'file-1', filename: 'Treino 01.pdf', size_bytes: 1000 },
  created_at: '2026-09-28T10:00:00Z',
  weekdays: [0, 2],
  day_count: 2,
  exercise_count: 2,
}

const plan: Plan = {
  id: 'plan-1',
  name: 'Treino 01',
  is_active: true,
  valid_until: null,
  source_file_id: 'file-1',
  created_at: '2026-09-28T10:00:00Z',
  days: [
    {
      id: 'day-1',
      weekday: 0,
      label: 'Peitoral',
      position: 0,
      exercises: [
        { id: 'e1', position: 0, name: 'Supino Reto', muscle_group: 'chest', sets: 3, reps: '12', rest_seconds: 90, rest_max_seconds: null, notes: null },
      ],
    },
    {
      id: 'day-2',
      weekday: 2,
      label: 'Costas',
      position: 1,
      exercises: [
        { id: 'e2', position: 0, name: 'Remada Curvada', muscle_group: 'back', sets: 4, reps: '10', rest_seconds: 90, rest_max_seconds: null, notes: null },
      ],
    },
  ],
}

/** The route's job: the search lives in state here instead of the URL. */
function Harness({ initial = {} }: { initial?: BuilderSearch }) {
  const [search, setSearch] = useState<BuilderSearch>(initial)
  return <BuilderScreen search={search} onSearchChange={setSearch} />
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
  localStorage.clear()
  serve({
    'GET /api/workouts': () => json([summary]),
    'GET /api/workouts/plan-1': () => json(plan),
    'GET /api/exercises/library': () =>
      json({
        entries: [
          { name: 'Supino Reto com Barra', muscle_group: 'chest', source: 'plan', plan_name: 'Treino 01', last_weight: '60.00' },
          { name: 'Supino Inclinado com Halteres', muscle_group: 'chest', source: 'base', plan_name: null, last_weight: null },
          { name: 'Remada Curvada', muscle_group: 'back', source: 'base', plan_name: null, last_weight: null },
        ],
      }),
    'POST /api/workouts': (body) => {
      const sent = body as PlanCreate
      return json({ ...plan, id: 'plan-2', name: sent.name, is_active: sent.activate, days: [] }, 201)
    },
  })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

describe('BuilderScreen', () => {
  it('builds a plan from scratch across the three steps and posts it', async () => {
    const u = userEvent.setup()
    renderWithRouter(<Harness />)

    // Step 1: name, Monday and Wednesday, a template.
    await u.type(await screen.findByLabelText('Nome do treino'), 'Full body 3× semana')
    await u.click(screen.getByRole('button', { name: 'Segunda' }))
    await u.click(screen.getByRole('button', { name: 'Quarta' }))
    expect(screen.getByText('2 dias')).toBeInTheDocument()
    await u.click(screen.getByRole('radio', { name: /^Modelo/ }))
    await u.click(screen.getByRole('button', { name: 'Continuar' }))

    // Step 2: the template laid its group cards over Monday.
    expect(await screen.findByText('Passo 2 de 3 · Segunda')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quadríceps' })).toBeInTheDocument()
    // "+ exercício" opens the library at that group: search without accents, add with one tap.
    await u.click(screen.getByRole('button', { name: 'Adicionar exercício em Peitoral' }))
    const library = await screen.findByRole('dialog')
    expect(within(library).getByRole('radio', { name: 'Peitoral' })).toHaveAttribute('aria-checked', 'true')
    await u.type(within(library).getByLabelText('Procurar exercício…'), 'supino reto')
    expect(within(library).getByText('Peitoral · última 60 kg')).toBeInTheDocument()
    expect(within(library).queryByText('Supino Inclinado com Halteres')).not.toBeInTheDocument()
    await u.click(within(library).getByRole('button', { name: 'Adicionar Supino Reto com Barra' }))
    // A second tap takes it off again; a third puts it back.
    const chosen = await within(library).findByRole('button', { name: 'Tirar Supino Reto com Barra deste dia' })
    expect(chosen).toHaveAttribute('aria-pressed', 'true')
    await u.click(chosen)
    expect(loadDraft()?.days[0].exercises).toEqual([])
    await u.click(await within(library).findByRole('button', { name: 'Adicionar Supino Reto com Barra' }))
    // A name nobody has becomes a custom exercise in the group.
    await u.clear(within(library).getByLabelText('Procurar exercício…'))
    await u.type(within(library).getByLabelText('Procurar exercício…'), 'Supino Máquina Unilateral')
    await u.click(within(library).getByRole('button', { name: 'Criar Supino Máquina Unilateral' }))
    await u.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Supino Máquina Unilateral')).toBeInTheDocument()

    // Tapping the row tunes it: preset, rest, technique.
    await u.click(screen.getByRole('button', { name: /^Supino Reto com Barra/ }))
    expect(await screen.findByLabelText('Nome do exercício')).toHaveValue('Supino Reto com Barra')
    await u.click(screen.getByRole('button', { name: '4×10' }))
    await u.click(screen.getByRole('button', { name: 'Mais 15 segundos de descanso' }))
    await u.click(screen.getByRole('button', { name: 'Drop set' }))
    await u.click(screen.getByRole('button', { name: /^Guardar/ }))
    expect(await screen.findByText('4×10 · 1:45 + Drop set')).toBeInTheDocument()

    // The draft is on this device as soon as it is edited.
    expect(loadDraft()?.name).toBe('Full body 3× semana')

    // Step 3: Wednesday is empty, so it is flagged; saving activates.
    await u.click(screen.getByRole('button', { name: 'Rever e ativar' }))
    expect(await screen.findByText('1 dia · 2 exercícios · ~15 min por sessão')).toBeInTheDocument()
    expect(screen.getByText('Dia vazio — fica como descanso?')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Ativar treino' }))

    expect(await screen.findByText('Full body 3× semana criado')).toBeInTheDocument()
    expect(posted()).toEqual([
      {
        name: 'Full body 3× semana',
        source_file_id: null,
        valid_until: null,
        activate: true,
        days: [
          {
            weekday: 0,
            label: 'Peitoral',
            exercises: [
              {
                name: 'Supino Reto com Barra',
                muscle_group: 'chest',
                sets: 4,
                reps: '10',
                rest_seconds: 105,
                rest_max_seconds: null,
                notes: 'Drop set',
              },
              {
                name: 'Supino Máquina Unilateral',
                muscle_group: 'chest',
                sets: 3,
                reps: '12',
                rest_seconds: 90,
                rest_max_seconds: null,
                notes: null,
              },
            ],
          },
        ],
      },
    ])
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('resumes the draft saved on this device, at the step asked for', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 1,
        name: 'Rascunho A',
        validUntil: null,
        days: [{ key: 'd1', weekday: 4, groups: ['back'], exercises: [] }],
      }),
    )
    renderWithRouter(<Harness initial={{ step: 2 }} />)
    expect(await screen.findByText('Passo 2 de 3 · Sexta')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rascunho A' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Costas' })).toBeInTheDocument()
  })

  it('"Criar do zero" drops the saved draft; "Duplicar" starts from the plan', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ version: 1, name: 'Velho', validUntil: null, days: [] }),
    )
    const { unmount } = renderWithRouter(<Harness initial={{ fresh: true }} />)
    expect(await screen.findByLabelText('Nome do treino')).toHaveValue('')
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull())
    unmount()

    renderWithRouter(<Harness initial={{ duplicate: 'plan-1' }} />)
    expect(await screen.findByLabelText('Nome do treino')).toHaveValue('Treino 01 (cópia)')
    expect(screen.getByRole('button', { name: 'Segunda' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Quarta' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('2 dias')).toBeInTheDocument()
  })

  it('copies the structure of an existing plan into the days', async () => {
    const u = userEvent.setup()
    renderWithRouter(<Harness />)
    await u.type(await screen.findByLabelText('Nome do treino'), 'Novo')
    await u.click(screen.getByRole('button', { name: 'Terça' }))
    await u.click(screen.getByRole('button', { name: 'Quinta' }))
    await u.click(screen.getByRole('radio', { name: /^Copiar estrutura de “Treino 01”/ }))
    await u.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByText('Passo 2 de 3 · Terça')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Peitoral' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Quinta' }))
    expect(await screen.findByText('Passo 2 de 3 · Quinta')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Costas' })).toBeInTheDocument()
  })

  it('asks before a group with exercises is removed', async () => {
    const u = userEvent.setup()
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 1,
        name: 'B',
        validUntil: null,
        days: [
          {
            key: 'd1',
            weekday: 0,
            groups: ['chest'],
            exercises: [
              { key: 'x', name: 'Supino', muscle_group: 'chest', sets: 3, reps: '12', rest_seconds: 90, rest_max_seconds: null, notes: null, techniques: [] },
            ],
          },
        ],
      }),
    )
    renderWithRouter(<Harness initial={{ step: 2 }} />)
    await u.click(await screen.findByRole('button', { name: 'Ações para Peitoral' }))
    await u.click(await screen.findByRole('menuitem', { name: 'Remover grupo' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Remover Peitoral deste dia?')).toBeInTheDocument()
    await u.click(within(dialog).getByRole('button', { name: 'Remover grupo' }))
    await waitFor(() => expect(screen.queryByText('Supino')).not.toBeInTheDocument())
    expect(loadDraft()?.days[0].groups).toEqual([])
  })
})
