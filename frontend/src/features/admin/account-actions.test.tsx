import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import type { AdminUser } from './types'
import { UsersScreen } from './users-screen'

const LIST = 'GET /api/admin/users?limit=25&offset=0'
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
  sessionStore.set({ accessToken: 'access-1', user: { ...user, is_admin: true } })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

const account = (name: string, fields: Partial<AdminUser> = {}): AdminUser => ({
  id: `id-${name.toLowerCase()}`,
  name,
  email: `${name.toLowerCase()}@example.pt`,
  language: 'pt',
  created_at: '2026-09-26T10:00:00Z',
  deactivated_at: null,
  is_admin: false,
  plans: 1,
  workouts: 14,
  last_workout_date: '2026-09-28',
  ...fields,
})

const row = async (name: string) => (await screen.findByRole('rowheader', { name: new RegExp(name) })).closest('tr')!
const openMenu = async (name: string) =>
  userEvent.click(await screen.findByRole('button', { name: `Ações para ${name}` }))

describe('Contas: closing accounts', () => {
  it('deactivates an account after a confirmation', async () => {
    let accounts = [account('Ana')]
    serve({
      [LIST]: () => json({ total: 1, items: accounts }),
      'PATCH /api/admin/users/id-ana': () => {
        accounts = [account('Ana', { deactivated_at: '2026-09-29T21:00:00Z' })]
        return json(accounts[0])
      },
    })
    renderWithRouter(<UsersScreen />)

    await openMenu('Ana')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Inativar' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Inativar a conta de Ana?' })
    expect(within(dialog).getByText(/podes reativar a conta quando quiseres/)).toBeInTheDocument()
    expect(requests('PATCH /api/admin/users/id-ana')).toEqual([])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Inativar conta' }))

    await waitFor(() => expect(requests('PATCH /api/admin/users/id-ana')).toEqual([{ active: false }]))
    expect(await within(await row('Ana')).findByText('Inativa')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('brings an inactive account back at once', async () => {
    serve({
      [LIST]: () => json({ total: 1, items: [account('Ana', { deactivated_at: '2026-09-29T21:00:00Z' })] }),
      'PATCH /api/admin/users/id-ana': () => json(account('Ana')),
    })
    renderWithRouter(<UsersScreen />)

    await openMenu('Ana')
    expect(screen.queryByRole('menuitem', { name: 'Inativar' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reativar' }))

    await waitFor(() => expect(requests('PATCH /api/admin/users/id-ana')).toEqual([{ active: true }]))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes an account only once its email was typed', async () => {
    let accounts = [account('Ana'), account('Bruno')]
    serve({
      [LIST]: () => json({ total: accounts.length, items: accounts }),
      'DELETE /api/admin/users/id-ana': () => {
        accounts = [account('Bruno')]
        return new Response(null, { status: 204 })
      },
    })
    renderWithRouter(<UsersScreen />)

    await openMenu('Ana')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Apagar' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Apagar a conta de Ana?' })
    expect(within(dialog).getByText(/Não pode ser desfeito/)).toBeInTheDocument()
    const confirm = within(dialog).getByRole('button', { name: 'Apagar para sempre' })
    const email = within(dialog).getByLabelText('Para confirmar, escreve ana@example.pt')

    expect(confirm).toBeDisabled()
    await userEvent.type(email, 'bruno@example.pt')
    expect(confirm).toBeDisabled()
    await userEvent.clear(email)
    await userEvent.type(email, 'Ana@example.pt ')
    await userEvent.click(confirm)

    await waitFor(() => expect(requests('DELETE /api/admin/users/id-ana')).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: /Ana/ })).not.toBeInTheDocument())
    expect(screen.getByRole('rowheader', { name: /Bruno/ })).toBeInTheDocument()
    expect(screen.getByText('1 conta')).toBeInTheDocument()
  })

  it('says why an account could not be deleted', async () => {
    serve({
      [LIST]: () => json({ total: 1, items: [account('Ana')] }),
      'DELETE /api/admin/users/id-ana': () => json({ detail: 'Account not found', code: 'user_not_found' }, 404),
    })
    renderWithRouter(<UsersScreen />)

    await openMenu('Ana')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Apagar' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.type(within(dialog).getByRole('textbox'), 'ana@example.pt')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar para sempre' }))

    expect(await within(dialog).findByText('Esta conta já não existe.')).toBeInTheDocument()
  })

  it('offers nothing for administrators’ accounts', async () => {
    serve({ [LIST]: () => json({ total: 2, items: [account('Dona', { is_admin: true }), account('Ana')] }) })
    renderWithRouter(<UsersScreen />)

    expect(within(await row('Dona')).getByText('Admin')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ações para Dona' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ações para Ana' })).toBeInTheDocument()
  })
})
