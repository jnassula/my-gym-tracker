import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { BottomTabs } from './bottom-tabs'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStore.set({ accessToken: 'access-1', user })
  fetchMock.mockImplementation(async () => json([]))
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

describe('BottomTabs', () => {
  it('has the four tabs and "+ Novo treino" in the middle, which opens the new-plan sheet', async () => {
    const u = userEvent.setup()
    renderWithRouter(<BottomTabs />)

    await screen.findByRole('link', { name: 'Início' })
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Início',
      'Treinos',
      'Progresso',
      'Definições',
    ])
    // Nothing is fetched for a bar nobody has tapped.
    expect(fetchMock).not.toHaveBeenCalled()

    await u.click(screen.getByRole('button', { name: 'Novo treino' }))

    const sheet = await screen.findByRole('dialog')
    expect(sheet).toHaveTextContent('Importar PDF')
    expect(sheet).toHaveTextContent('Criar do zero')
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/workouts')

    // Picking a way in closes the sheet: the bar stays, the page changes.
    await u.click(screen.getByRole('link', { name: /Criar do zero/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
