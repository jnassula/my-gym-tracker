import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { saveDraft, loadDraft } from '@/features/workouts/builder/storage'
import { emptyDraft } from '@/features/workouts/builder/draft'
import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { AccountScreen } from './account-screen'

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

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  localStorage.clear()
  sessionStore.set(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function openDialog() {
  renderWithRouter(<AccountScreen />)
  await userEvent.click(await screen.findByRole('button', { name: 'Eliminar conta' }))
  return screen.findByRole('alertdialog')
}

describe('AccountScreen', () => {
  it('saves the account’s data as a file', async () => {
    serve({ 'GET /api/users/me/export': () => json({ account: { email: user.email } }) })
    const saved: string[] = []
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:data')
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download)
    })
    renderWithRouter(<AccountScreen />)

    await userEvent.click(await screen.findByRole('button', { name: 'Exportar os meus dados' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatch(/^mygymtracker-\d{4}-\d{2}-\d{2}\.json$/)
    expect(requests('GET /api/users/me/export')).toHaveLength(1)
  })

  it('only deletes once the email is typed and the password given', async () => {
    serve({ 'DELETE /api/users/me': () => new Response(null, { status: 204 }) })
    saveDraft({ ...emptyDraft(), name: 'Full body' })
    await openDialog()
    const confirm = screen.getByRole('button', { name: 'Eliminar de vez' })
    expect(confirm).toBeDisabled()

    await userEvent.type(screen.getByLabelText(`Escreve ${user.email} para confirmar`), 'outro@example.pt')
    await userEvent.type(screen.getByLabelText('Palavra-passe'), 'Treino2026!')
    expect(confirm).toBeDisabled()

    await userEvent.clear(screen.getByLabelText(`Escreve ${user.email} para confirmar`))
    await userEvent.type(screen.getByLabelText(`Escreve ${user.email} para confirmar`), ` ${user.email.toUpperCase()} `)
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)

    await waitFor(() => expect(sessionStore.get()).toBeNull())
    expect(requests('DELETE /api/users/me')).toEqual([{ password: 'Treino2026!' }])
    // Nothing of the account stays on the device.
    sessionStore.set({ accessToken: 'access-2', user })
    expect(loadDraft()).toBeNull()
  })

  it('keeps the account when the password is wrong', async () => {
    serve({
      'DELETE /api/users/me': () =>
        json({ detail: 'Current password is incorrect', code: 'invalid_current_password' }, 400),
    })
    await openDialog()

    await userEvent.type(screen.getByLabelText(`Escreve ${user.email} para confirmar`), user.email)
    await userEvent.type(screen.getByLabelText('Palavra-passe'), 'errada')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar de vez' }))

    expect(await screen.findByText('A palavra-passe atual está incorreta.')).toBeInTheDocument()
    expect(sessionStore.get()).not.toBeNull()
  })
})
