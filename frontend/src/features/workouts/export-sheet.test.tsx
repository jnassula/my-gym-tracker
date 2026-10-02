import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { renderWithRouter, user } from '@/test/render'

import { ExportSheet } from './export-sheet'
import type { Plan } from './types'

const plan: Plan = {
  id: 'plan-1',
  name: 'Full body 3× semana',
  is_active: true,
  valid_until: '2026-12-15',
  source_file_id: null,
  created_at: '2026-10-02T10:00:00Z',
  days: [
    {
      id: 'day-1',
      weekday: 0,
      label: 'Peitoral',
      position: 0,
      exercises: [
        { id: 'e1', position: 0, name: 'Supino Reto com Barra', muscle_group: 'chest', sets: 3, reps: '12', rest_seconds: 90, rest_max_seconds: null, notes: null },
      ],
    },
  ],
}

const fetchMock = vi.fn<typeof fetch>()
const share = vi.fn<(data: ShareData) => Promise<void>>()
const canShare = vi.fn<(data: ShareData) => boolean>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
  fetchMock.mockImplementation(async (input) =>
    new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), {
      status: 200,
      headers: { 'content-type': 'application/pdf', 'x-url': String(input) },
    }),
  )
  Object.assign(navigator, { share, canShare })
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => 'blob:pdf')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  share.mockReset()
  canShare.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

describe('ExportSheet', () => {
  it('shows the paper and shares the PDF with the weights when the browser can', async () => {
    canShare.mockReturnValue(true)
    share.mockResolvedValue()
    const u = userEvent.setup()
    renderWithRouter(<ExportSheet open plan={plan} onOpenChange={() => {}} />)

    expect(await screen.findByText('1 dia · A4')).toBeInTheDocument()
    expect(screen.getByLabelText('Pré-visualização do PDF')).toHaveTextContent('Supino Reto com Barra')
    expect(screen.getByLabelText('Pré-visualização do PDF')).toHaveTextContent('Aluno: Jonata')
    await u.click(screen.getByRole('button', { name: 'Partilhar' }))

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/workouts/plan-1/export.pdf?weights=true')
    const shared = share.mock.calls[0][0]
    expect(shared.title).toBe('Full body 3× semana')
    expect(shared.files?.[0].name).toBe('Full body 3 semana.pdf')
    expect(shared.files?.[0].type).toBe('application/pdf')
  })

  it('saves without weights when the switch is off; no share button without the API', async () => {
    canShare.mockReturnValue(false)
    const u = userEvent.setup()
    renderWithRouter(<ExportSheet open plan={plan} onOpenChange={() => {}} />)

    expect(screen.queryByRole('button', { name: 'Partilhar' })).not.toBeInTheDocument()
    await u.click(await screen.findByRole('switch', { name: /Incluir cargas atuais/ }))
    await u.click(screen.getByRole('button', { name: 'Guardar em Ficheiros' }))

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/workouts/plan-1/export.pdf')
  })
})
