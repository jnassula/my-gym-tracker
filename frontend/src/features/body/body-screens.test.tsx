import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OverviewScreen } from '@/features/progress/overview-screen'
import { ProfileScreen } from '@/features/settings/profile-screen'
import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { BodyScreen } from './body-screen'
import { connectScale, scaleSupport, ScaleConnectionError } from './scale'
import type { Frame } from './scale-frame'
import type { BodyOverview, Measurement } from './types'

// Web Bluetooth doesn't exist in jsdom: the browser's part is replaced, and the tests play the
// scale by calling what the screen listens with.
vi.mock('./scale', async (original) => ({
  ...(await original<typeof import('./scale')>()),
  scaleSupport: vi.fn(),
  connectScale: vi.fn(),
}))

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

const weighing = (changes: Partial<Measurement> = {}): Measurement => ({
  id: 'm-1',
  measured_at: '2026-09-28T17:30:00Z',
  source: 'manual',
  weight: 78.4,
  bmi: null,
  body_fat_pct: null,
  water_pct: null,
  muscle_kg: null,
  bone_kg: null,
  visceral_fat: null,
  bmr_kcal: null,
  ...changes,
})

const fromScale = weighing({
  id: 'm-2',
  source: 'scale',
  weight: 78.45,
  bmi: 24.2,
  body_fat_pct: 22.5,
  water_pct: 53.1,
  muscle_kg: 57.7,
  bone_kg: 3.1,
  visceral_fat: 13,
  bmr_kcal: 1612,
})

const empty: BodyOverview = {
  latest: null,
  range: '3m',
  points: [],
  change: null,
  measurements: [],
  profile_complete: false,
}

const filled: BodyOverview = {
  latest: fromScale,
  range: '3m',
  points: [
    { date: '2026-09-21', weight: 79, body_fat_pct: null },
    { date: '2026-09-28', weight: 78.45, body_fat_pct: 22.5 },
  ],
  change: -0.55,
  measurements: [fromScale, weighing({ id: 'm-1', measured_at: '2026-09-21T11:00:00Z', weight: 79 })],
  profile_complete: true,
}

const BODY = 'GET /api/body?range=3m'
const ADD = 'POST /api/body/measurements'
const props = { range: '3m', metric: 'weight', onRangeChange: () => {}, onMetricChange: () => {} } as const

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
  vi.mocked(scaleSupport).mockReturnValue('supported')
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  vi.mocked(connectScale).mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

describe('BodyScreen', () => {
  it('shows the latest weighing with its composition, the change and every weighing', async () => {
    serve({ [BODY]: () => json(filled) })
    renderWithRouter(<BodyScreen {...props} />)

    expect(await screen.findByText('78,45 kg', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('28 set. · 18:30 · Balança')).toBeInTheDocument()
    const figure = (name: string) => screen.getByText(name).nextElementSibling
    expect(figure('Gordura corporal')).toHaveTextContent('22,5 %')
    expect(figure('Massa muscular')).toHaveTextContent('57,7 kg')
    expect(figure('Metabolismo basal')).toHaveTextContent('1612 kcal')
    expect(screen.getByText('Variação no período').nextElementSibling).toHaveTextContent('−0,55 kg')
    expect(screen.getByRole('heading', { name: 'Peso por dia' })).toBeInTheDocument()
    const rows = within(screen.getByRole('table', { name: 'Pesagens' })).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual(['28 set. · 18:3078,45 kg22,5 %', '21 set.79 kg—'])
  })

  it('offers the body fat on the chart only when a weighing has it', async () => {
    const onMetricChange = vi.fn()
    serve({ [BODY]: () => json(filled) })
    const { unmount } = renderWithRouter(<BodyScreen {...props} onMetricChange={onMetricChange} />)

    const metrics = await screen.findByRole('group', { name: 'O que o gráfico mostra' })
    await userEvent.click(within(metrics).getByRole('button', { name: 'Gordura' }))
    expect(onMetricChange).toHaveBeenCalledWith('body_fat')
    unmount()

    const plain = { ...filled, points: filled.points.map((point) => ({ ...point, body_fat_pct: null })) }
    serve({ [BODY]: () => json(plain) })
    // Asked for body fat (an old link), but nothing has it: the weight is shown.
    renderWithRouter(<BodyScreen {...props} metric="body_fat" />)
    expect(await screen.findByRole('heading', { name: 'Peso por dia' })).toBeInTheDocument()
    expect(screen.getByText('Variação no período').nextElementSibling).toHaveTextContent('−0,55 kg')
    expect(screen.queryByRole('group', { name: 'O que o gráfico mostra' })).not.toBeInTheDocument()
  })

  it('asks for the profile when a scale’s weighing can’t show its composition', async () => {
    const bare = weighing({ source: 'scale' })
    serve({ [BODY]: () => json({ ...filled, latest: bare, measurements: [bare], profile_complete: false }) })
    renderWithRouter(<BodyScreen {...props} />)

    expect(await screen.findByRole('link', { name: 'Completar o perfil' })).toHaveAttribute(
      'href',
      '/settings/profile',
    )
  })

  it('takes a weight typed in pounds and sends it in kg', async () => {
    sessionStore.set({ accessToken: 'access-1', user: { ...user, unit: 'lb' } })
    vi.mocked(scaleSupport).mockReturnValue('ios')
    serve({ [BODY]: () => json(empty), [ADD]: () => json(weighing(), 201) })
    renderWithRouter(<BodyScreen {...props} />)

    expect(await screen.findByText('Ainda sem pesagens')).toBeInTheDocument()
    // No Bluetooth in any browser on an iPhone: typing it in is the way, and the screen says why.
    expect(screen.queryByRole('button', { name: 'Pesar agora' })).not.toBeInTheDocument()
    expect(screen.getByText(/No iPhone os browsers não têm Bluetooth/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar manualmente' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(within(dialog).getByText('Um peso entre 22 e 661,4 lb.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Peso (lb)'), '172,8')
    await userEvent.type(within(dialog).getByLabelText('Gordura corporal (%)'), '21,5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(requests(ADD)).toEqual([{ source: 'manual', weight: 78.38, body_fat_pct: 21.5 }]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('dates a weighing typed in for an earlier day', async () => {
    serve({ [BODY]: () => json(empty), [ADD]: () => json(weighing(), 201) })
    renderWithRouter(<BodyScreen {...props} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar manualmente' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Peso (kg)'), '79')
    const day = within(dialog).getByLabelText('Data')
    await userEvent.clear(day)
    await userEvent.type(day, '2026-09-21')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(requests(ADD)).toEqual([{ source: 'manual', weight: 79, day: '2026-09-21' }]))
  })

  it('deletes a weighing after confirming', async () => {
    serve({
      [BODY]: () => json(filled),
      'DELETE /api/body/measurements/m-1': () => new Response(null, { status: 204 }),
    })
    renderWithRouter(<BodyScreen {...props} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Apagar a pesagem de 21 set.' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('21 set.: 79 kg. Não pode ser desfeito.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar' }))

    await waitFor(() => expect(requests('DELETE /api/body/measurements/m-1')).toHaveLength(1))
  })
})

describe('weighing on the scale', () => {
  /** Opens "Pesar agora", connects, and gives back what plays the scale. */
  async function onTheScale() {
    let listeners: Parameters<typeof connectScale>[0] | undefined
    const release = vi.fn()
    vi.mocked(connectScale).mockImplementation(async (given) => {
      listeners = given
      return release
    })
    renderWithRouter(<BodyScreen {...props} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Pesar agora' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ligar à balança' }))
    expect(await screen.findByText('Sobe para a balança, descalço.')).toBeInTheDocument()
    const send = (frame: Partial<Frame>) =>
      act(() => listeners?.onFrame({ weightKg: 78.45, impedance: null, stable: false, removed: false, ...frame }))
    return { send, release }
  }

  it('follows the weight, saves the settled reading and shows its composition', async () => {
    serve({ [BODY]: () => json(empty), [ADD]: () => json(fromScale, 201) })
    const { send, release } = await onTheScale()

    send({ weightKg: 61.2 })
    expect(screen.getByText('61,2 kg')).toBeInTheDocument()
    expect(screen.getByText('A pesar…')).toBeInTheDocument()
    send({ stable: true, impedance: 480 })

    expect(await screen.findByText('Pesagem guardada')).toBeInTheDocument()
    expect(requests(ADD)).toEqual([{ source: 'scale', weight: 78.45, impedance: 480 }])
    expect(screen.getByText('Gordura corporal').nextElementSibling).toHaveTextContent('22,5 %')
    // The reading is taken: the scale is let go, and what it says next changes nothing.
    expect(release).toHaveBeenCalledTimes(1)
    send({ weightKg: 80, stable: true, impedance: 500 })
    expect(requests(ADD)).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Concluído' }))
    await waitFor(() => expect(screen.queryByText('Pesagem guardada')).not.toBeInTheDocument())
  })

  it('lets the scale go when the sheet is closed before a reading', async () => {
    serve({ [BODY]: () => json(empty) })
    const { send, release } = await onTheScale()
    send({ weightKg: 61.2 })

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))

    await waitFor(() => expect(release).toHaveBeenCalledTimes(1))
    expect(requests(ADD)).toHaveLength(0)
  })

  it('says why the scale was not reached and tries again', async () => {
    serve({ [BODY]: () => json(empty) })
    vi.mocked(connectScale).mockRejectedValueOnce(new ScaleConnectionError('cancelled'))
    vi.mocked(connectScale).mockResolvedValueOnce(vi.fn())
    renderWithRouter(<BodyScreen {...props} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Pesar agora' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ligar à balança' }))
    expect(await screen.findByText('Não escolheste nenhuma balança.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar outra vez' }))

    expect(await screen.findByText('Sobe para a balança, descalço.')).toBeInTheDocument()
  })
})

describe('the ways in', () => {
  const overview = {
    week_streak: 0,
    week_volume: 0,
    records_this_month: 0,
    sets_by_group: [],
    exercises: [],
    last_record: null,
  }

  it('shows the latest weight on Progresso, even before a first workout', async () => {
    serve({ 'GET /api/progress': () => json(overview), [BODY]: () => json(filled) })
    renderWithRouter(<OverviewScreen />)

    const card = await screen.findByRole('link', { name: /Peso corporal/ })
    expect(card).toHaveAttribute('href', '/progress/body')
    expect(await within(card).findByText('78,45 kg · 28 set.')).toBeInTheDocument()
  })
})

describe('ProfileScreen: body details', () => {
  const CALENDAR = 'GET /api/progress/calendar'

  it('saves the height, date of birth and sex, and clears what is emptied', async () => {
    const stored = { ...user, height_cm: 180, birth_date: '1992-03-15', sex: 'male' as const }
    serve({
      [CALENDAR]: () => json({ sessions_total: 0, days: [] }),
      'PATCH /api/users/me': (body) => json({ ...stored, ...(body as object) }),
    })
    renderWithRouter(<ProfileScreen />)

    const save = await screen.findByRole('button', { name: 'Guardar dados corporais' })
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Altura (cm)'), '18')
    expect(screen.getByText('Entre 50 e 260 cm.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Altura (cm)'), '0')
    await userEvent.type(screen.getByLabelText('Data de nascimento'), '1992-03-15')
    await userEvent.click(screen.getByRole('button', { name: 'Masculino' }))
    await userEvent.click(save)

    await waitFor(() =>
      expect(requests('PATCH /api/users/me')).toEqual([{ height_cm: 180, birth_date: '1992-03-15', sex: 'male' }]),
    )
    expect(sessionStore.get()?.user).toMatchObject({ height_cm: 180, sex: 'male' })

    await userEvent.clear(screen.getByLabelText('Altura (cm)'))
    await userEvent.click(save)
    await waitFor(() => expect(requests('PATCH /api/users/me')[1]).toMatchObject({ height_cm: null }))
  })
})
