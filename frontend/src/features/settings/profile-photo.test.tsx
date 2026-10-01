import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { toAvatar, UnreadableImageError } from './avatar'
import { ProfileScreen } from './profile-screen'

// The crop needs a canvas, which jsdom doesn't have: the browser's part is replaced by a stub.
vi.mock('./avatar', async (original) => ({
  ...(await original<typeof import('./avatar')>()),
  toAvatar: vi.fn(),
}))

const CROPPED = new Blob(['cropped'], { type: 'image/jpeg' })
const PICKED = new File(['a 4000 x 3000 phone photo'], 'IMG_0042.HEIC', { type: 'image/heic' })
const CALENDAR = 'GET /api/progress/calendar'

const fetchMock = vi.fn<typeof fetch>()
type Handler = (body: BodyInit | null | undefined) => Response

function serve(routes: Record<string, Handler>) {
  fetchMock.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    const handler = routes[key] ?? (key === CALENDAR ? () => json({ sessions_total: 0, days: [] }) : undefined)
    if (!handler) throw new Error(`Unexpected request: ${key}`)
    return handler(init?.body)
  })
}

const requests = (key: string) =>
  fetchMock.mock.calls.filter(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key)

const pick = (file: File) => userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file)

let urls = 0
const revoked: string[] = []

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => `blob:photo-${++urls}`)
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url))
  vi.mocked(toAvatar).mockResolvedValue(CROPPED)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  vi.mocked(toAvatar).mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
  urls = 0
  revoked.length = 0
})

describe('ProfileScreen: the photo', () => {
  it('uploads the cropped picture, not the file that was picked', async () => {
    let sent: FormData | undefined
    serve({
      'PUT /api/users/me/avatar': (body) => {
        sent = body as FormData
        return json({ ...user, avatar_file_id: 'photo-1' })
      },
    })
    renderWithRouter(<ProfileScreen />)

    expect(await screen.findByRole('button', { name: 'Adicionar foto' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument()
    await pick(PICKED)

    expect(await screen.findByRole('button', { name: 'Alterar foto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover foto' })).toBeInTheDocument()
    expect(toAvatar).toHaveBeenCalledWith(PICKED)
    const file = sent?.get('file') as File
    expect([file.name, file.type, await file.text()]).toEqual(['avatar.jpg', 'image/jpeg', 'cropped'])
    expect(sessionStore.get()?.user.avatar_file_id).toBe('photo-1')
    // What was sent is shown as it is: nothing is downloaded again.
    expect(requests('GET /api/files/photo-1/content')).toHaveLength(0)
  })

  it('shows the photo of an account that has one, and removes it', async () => {
    sessionStore.set({ accessToken: 'access-1', user: { ...user, avatar_file_id: 'photo-1' } })
    serve({
      'GET /api/files/photo-1/content': () => new Response(new Blob(['stored'], { type: 'image/jpeg' })),
      'DELETE /api/users/me/avatar': () => json({ ...user, avatar_file_id: null }),
    })
    renderWithRouter(<ProfileScreen />)

    await waitFor(() => expect(requests('GET /api/files/photo-1/content')).toHaveLength(1))
    await userEvent.click(await screen.findByRole('button', { name: 'Remover foto' }))

    expect(await screen.findByRole('button', { name: 'Adicionar foto' })).toBeInTheDocument()
    expect(sessionStore.get()?.user.avatar_file_id).toBeNull()
    expect(revoked).toEqual(['blob:photo-1']) // its object URL is released
  })

  it('releases the old photo when another one replaces it', async () => {
    sessionStore.set({ accessToken: 'access-1', user: { ...user, avatar_file_id: 'photo-1' } })
    serve({
      'GET /api/files/photo-1/content': () => new Response(new Blob(['stored'], { type: 'image/jpeg' })),
      'PUT /api/users/me/avatar': () => json({ ...user, avatar_file_id: 'photo-2' }),
    })
    renderWithRouter(<ProfileScreen />)

    await waitFor(() => expect(requests('GET /api/files/photo-1/content')).toHaveLength(1))
    await pick(PICKED)

    await waitFor(() => expect(sessionStore.get()?.user.avatar_file_id).toBe('photo-2'))
    expect(revoked).toEqual(['blob:photo-1'])
    expect(requests('GET /api/files/photo-2/content')).toHaveLength(0)
  })

  it('says when the browser cannot read the picture, and sends nothing', async () => {
    vi.mocked(toAvatar).mockRejectedValue(new UnreadableImageError())
    serve({})
    renderWithRouter(<ProfileScreen />)

    await screen.findByRole('button', { name: 'Adicionar foto' })
    await pick(PICKED)

    expect(await screen.findByText('Não conseguimos ler esta imagem. Tenta um JPG ou PNG.')).toBeInTheDocument()
    expect(requests('PUT /api/users/me/avatar')).toHaveLength(0)
  })

  it('says why the server refused the picture', async () => {
    serve({
      'PUT /api/users/me/avatar': () => json({ detail: 'File is larger than 1 MB', code: 'file_too_large' }, 413),
    })
    renderWithRouter(<ProfileScreen />)

    await screen.findByRole('button', { name: 'Adicionar foto' })
    await pick(PICKED)

    expect(await screen.findByText('O ficheiro é demasiado grande.')).toBeInTheDocument()
    expect(sessionStore.get()?.user.avatar_file_id).toBeNull()
  })
})
