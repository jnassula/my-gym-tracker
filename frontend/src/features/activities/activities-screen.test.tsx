import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { ActivitiesScreen } from './activities-screen'
import type { Activities, Activity } from './types'

const FOOTVOLLEY: Activity = { id: 'act-1', name: 'Futevôlei', weekdays: [2], avoid: ['lower'] }
const SURF: Activity = { id: 'act-2', name: 'Surf', weekdays: [], avoid: ['upper'] }
const PLAN_DAYS: Activities['plan_days'] = [
  { day_id: 'a', label: 'Treino A', weekday: null, regions: ['upper'] },
  { day_id: 'b', label: 'Treino B', weekday: null, regions: ['lower'] },
  { day_id: 'c', label: '', weekday: 4, regions: ['core'] },
]

const fetchMock = vi.fn<typeof fetch>()
type Handler = (body: unknown) => Response

function serve(routes: Record<string, Handler>) {
  fetchMock.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected request: ${key}`)
    return handler(init?.body ? JSON.parse(String(init.body)) : undefined)
  })
}

const sent = (key: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined))

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

describe('ActivitiesScreen', () => {
  it('lists the activities with their days and what they avoid', async () => {
    serve({ 'GET /api/activities': () => json({ activities: [FOOTVOLLEY, SURF], plan_days: PLAN_DAYS }) })
    renderWithRouter(<ActivitiesScreen />)

    expect(await screen.findByRole('button', { name: /Futevôlei/ })).toHaveTextContent('Qua · evita inferiores')
    expect(screen.getByRole('button', { name: /Surf/ })).toHaveTextContent('Sem dia fixo · evita superiores')
  })

  it('invites to add the first one', async () => {
    serve({ 'GET /api/activities': () => json({ activities: [], plan_days: PLAN_DAYS }) })
    renderWithRouter(<ActivitiesScreen />)

    expect(await screen.findByText(/Ainda sem atividades/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova atividade' })).toBeInTheDocument()
  })

  it('adds an activity with its fixed days and what it shouldn’t share a day with', async () => {
    serve({
      'GET /api/activities': () => json({ activities: [], plan_days: PLAN_DAYS }),
      'POST /api/activities': () => json(FOOTVOLLEY, 201),
    })
    renderWithRouter(<ActivitiesScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Nova atividade' }))

    const sheet = await screen.findByRole('dialog', { name: 'Nova atividade' })
    expect(within(sheet).getByRole('button', { name: 'Guardar' })).toBeDisabled() // no name yet
    await userEvent.type(within(sheet).getByLabelText('Nome'), '  Futevôlei ')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Quarta' }))
    expect(within(sheet).getByText('No dia da atividade a app não sugere treinos destas zonas.')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Inferiores' }))
    // What it means in the plan there is, worked out from its exercises.
    expect(within(sheet).getByText('No plano atual evita: Treino B.')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Abdómen' }))
    expect(within(sheet).getByText('No plano atual evita: Treino B e Sexta.')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(sent('POST /api/activities')).toEqual([{ name: 'Futevôlei', weekdays: [2], avoid: ['lower', 'core'] }]),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says so when what an activity avoids is in no workout of the plan', async () => {
    serve({ 'GET /api/activities': () => json({ activities: [], plan_days: [PLAN_DAYS[0]] }) })
    renderWithRouter(<ActivitiesScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Nova atividade' }))

    const sheet = await screen.findByRole('dialog', { name: 'Nova atividade' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Inferiores' }))

    expect(within(sheet).getByText('No plano atual não evita nenhum treino.')).toBeInTheDocument()
  })

  it('changes an activity', async () => {
    serve({
      'GET /api/activities': () => json({ activities: [SURF], plan_days: PLAN_DAYS }),
      'PATCH /api/activities/act-2': () => json({ ...SURF, weekdays: [5] }),
    })
    renderWithRouter(<ActivitiesScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Surf/ }))

    const sheet = await screen.findByRole('dialog', { name: 'Editar atividade' })
    expect(within(sheet).getByLabelText('Nome')).toHaveValue('Surf')
    expect(within(sheet).getByRole('button', { name: 'Superiores' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sábado' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(sent('PATCH /api/activities/act-2')).toEqual([{ name: 'Surf', weekdays: [5], avoid: ['upper'] }]),
    )
  })

  it('shows why an activity couldn’t be saved', async () => {
    serve({
      'GET /api/activities': () => json({ activities: [SURF], plan_days: [] }),
      'POST /api/activities': () => json({ detail: 'Taken', code: 'activity_name_taken' }, 409),
    })
    renderWithRouter(<ActivitiesScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Nova atividade' }))

    const sheet = await screen.findByRole('dialog', { name: 'Nova atividade' })
    await userEvent.type(within(sheet).getByLabelText('Nome'), 'Surf')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar' }))

    expect(await within(sheet).findByText('Já tens uma atividade com esse nome.')).toBeInTheDocument()
  })

  it('deletes an activity after asking', async () => {
    serve({
      'GET /api/activities': () => json({ activities: [SURF], plan_days: PLAN_DAYS }),
      'DELETE /api/activities/act-2': () => new Response(null, { status: 204 }),
    })
    renderWithRouter(<ActivitiesScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /Surf/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar atividade' }))

    const question = await screen.findByRole('alertdialog', { name: 'Apagar Surf?' })
    expect(within(question).getByText(/continuam no calendário/)).toBeInTheDocument()
    expect(sent('DELETE /api/activities/act-2')).toHaveLength(0)
    await userEvent.click(within(question).getByRole('button', { name: 'Apagar' }))

    await waitFor(() => expect(sent('DELETE /api/activities/act-2')).toHaveLength(1))
  })
})
