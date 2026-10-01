import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'
import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'
import type { PlanSummary } from '@/features/workouts/types'

import { PdfsScreen } from './pdfs-screen'
import { SettingsScreen } from './settings-screen'
import { TimeZoneScreen } from './timezone-screen'

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

const requests = (key: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined))

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(async () => {
  cleanup()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
  await i18n.changeLanguage('pt')
})

describe('SettingsScreen', () => {
  it('changes preferences at once and saves them', async () => {
    serve({
      'GET /api/workouts': () => json([]),
      'PATCH /api/users/me': (body) => json({ ...user, ...(body as object) }),
    })
    renderWithRouter(<SettingsScreen />)

    const units = await screen.findByRole('group', { name: 'Unidades' })
    await userEvent.click(within(units).getByRole('button', { name: 'lb' }))
    expect(within(units).getByRole('button', { name: 'lb' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('switch', { name: /Descanso automático/ }))

    await waitFor(() =>
      expect(requests('PATCH /api/users/me')).toEqual([{ unit: 'lb' }, { auto_rest: false }]),
    )
    expect(sessionStore.get()?.user).toMatchObject({ unit: 'lb', auto_rest: false })
  })

  it('says which version this device is running', async () => {
    serve({ 'GET /api/workouts': () => json([]) })
    renderWithRouter(<SettingsScreen />)

    // Production builds carry the version CI worked out; anywhere else it is "dev".
    expect(await screen.findByText('Versão dev')).toBeInTheDocument()
  })

  it('switches the language of the app', async () => {
    serve({
      'GET /api/workouts': () => json([]),
      'PATCH /api/users/me': (body) => json({ ...user, ...(body as object) }),
    })
    renderWithRouter(<SettingsScreen />)

    await userEvent.click(within(await screen.findByRole('group', { name: 'Idioma' })).getByRole('button', { name: 'EN' }))

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('puts a preference back when the server refuses it', async () => {
    serve({
      'GET /api/workouts': () => json([]),
      'PATCH /api/users/me': () => json({ detail: 'nope', code: 'validation_error' }, 422),
    })
    renderWithRouter(<SettingsScreen />)

    const units = await screen.findByRole('group', { name: 'Unidades' })
    await userEvent.click(within(units).getByRole('button', { name: 'lb' }))

    await waitFor(() => expect(within(units).getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true'))
    expect(sessionStore.get()?.user.unit).toBe('kg')
  })
})

describe('TimeZoneScreen', () => {
  it('finds a zone and saves it', async () => {
    serve({ 'PATCH /api/users/me': (body) => json({ ...user, ...(body as object) }) })
    renderWithRouter(<TimeZoneScreen />)

    await userEvent.type(await screen.findByRole('searchbox', { name: 'Procurar cidade ou região' }), 'sao paulo')
    await userEvent.click(screen.getByRole('button', { name: 'America/Sao Paulo' }))

    await waitFor(() => expect(requests('PATCH /api/users/me')).toEqual([{ timezone: 'America/Sao_Paulo' }]))
  })
})

const plans: PlanSummary[] = [
  {
    id: 'plan-1',
    name: 'Treino 01 — Jonata',
    is_active: true,
    valid_until: '2027-04-15',
    source_file_id: 'file-1',
    source_file: { id: 'file-1', filename: 'Treino Jonata 01.pdf', size_bytes: 1_258_291 },
    created_at: '2026-09-30T10:00:00Z',
    weekdays: [0, 1, 2, 4, 5, 6],
    day_count: 6,
    exercise_count: 48,
  },
  {
    id: 'plan-2',
    name: 'Hipertrofia — Fase 2',
    is_active: false,
    valid_until: null,
    source_file_id: 'file-2',
    source_file: { id: 'file-2', filename: 'treino_fase2.pdf', size_bytes: 838_861 },
    created_at: '2026-06-12T10:00:00Z',
    weekdays: [0, 1, 3, 4],
    day_count: 4,
    exercise_count: 31,
  },
]

describe('PdfsScreen', () => {
  it('lists each plan with its PDF', async () => {
    serve({ 'GET /api/workouts': () => json(plans) })
    renderWithRouter(<PdfsScreen />)

    expect(await screen.findByText('Treino Jonata 01.pdf · 1,2 MB · importado 30 set. 2026')).toBeInTheDocument()
    expect(screen.getByText('6 dias · 48 exercícios · trocar até 15 abr. 2027')).toBeInTheDocument()
    expect(screen.getByText('Ativo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tornar ativo' })).toBeInTheDocument()
  })

  it('makes another plan active', async () => {
    serve({
      'GET /api/workouts': () => json(plans),
      'PATCH /api/workouts/plan-2': () => json({ ...plans[1], is_active: true, days: [] }),
    })
    renderWithRouter(<PdfsScreen />)

    await userEvent.click(await screen.findByRole('button', { name: 'Tornar ativo' }))

    await waitFor(() => expect(requests('PATCH /api/workouts/plan-2')).toEqual([{ is_active: true }]))
  })

  it('renames a plan', async () => {
    serve({
      'GET /api/workouts': () => json(plans),
      'PATCH /api/workouts/plan-1': (body) => json({ ...plans[0], ...(body as object), days: [] }),
    })
    renderWithRouter(<PdfsScreen />)

    await userEvent.click(await screen.findByRole('button', { name: 'Renomear' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renomear plano' })
    await userEvent.clear(within(dialog).getByLabelText('Nome'))
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Treino de Outubro')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(requests('PATCH /api/workouts/plan-1')).toEqual([{ name: 'Treino de Outubro' }]))
  })

  it('confirms before deleting, and says the history stays', async () => {
    serve({
      'GET /api/workouts': () => json(plans),
      'DELETE /api/workouts/plan-1': () => new Response(null, { status: 204 }),
    })
    renderWithRouter(<PdfsScreen />)

    await userEvent.click(await screen.findByRole('button', { name: 'Apagar' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Apagar “Treino 01 — Jonata”?' })
    expect(
      within(dialog).getByText(
        'O PDF e a estrutura extraída são removidos. O histórico de cargas dos exercícios mantém-se.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar' }))

    await waitFor(() => expect(requests('DELETE /api/workouts/plan-1')).toHaveLength(1))
  })

  it('invites to import when there are none', async () => {
    serve({ 'GET /api/workouts': () => json([]) })
    renderWithRouter(<PdfsScreen />)

    expect(await screen.findByText('Ainda sem PDFs importados')).toBeInTheDocument()
  })
})
