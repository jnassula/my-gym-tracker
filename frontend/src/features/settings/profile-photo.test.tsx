import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { loadPicture, paint, toJpeg, turnPicture, UnreadableImageError, type Picture } from './avatar'
import { ProfileScreen } from './profile-screen'

// Reading and drawing pictures needs a canvas, which jsdom doesn't have: the browser's part is
// replaced by stubs, and what the editor asks them to draw is what the tests look at.
vi.mock('./avatar', async (original) => ({
  ...(await original<typeof import('./avatar')>()),
  loadPicture: vi.fn(),
  turnPicture: vi.fn(),
  paint: vi.fn(),
  toJpeg: vi.fn(),
}))

const picture = (width: number, height: number) => ({ width, height }) as Picture
const LANDSCAPE = picture(2000, 1200)
const CROPPED = new Blob(['cropped'], { type: 'image/jpeg' })
const PICKED = new File(['a phone photo'], 'IMG_0042.HEIC', { type: 'image/heic' })
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

/** Chooses a picture and waits for the editor. */
async function openEditor() {
  await screen.findByRole('button', { name: /Adicionar foto|Alterar foto/ })
  await pick(PICKED)
  return screen.findByRole('dialog', { name: 'Ajustar foto' })
}

/** What the last save cut out of the picture, and of which picture. */
const saved = () => {
  const [from, rect] = vi.mocked(toJpeg).mock.lastCall!
  return { size: [from.width, from.height], rect }
}

let urls = 0
const revoked: string[] = []

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => `blob:photo-${++urls}`)
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url))
  vi.mocked(loadPicture).mockResolvedValue(LANDSCAPE)
  vi.mocked(turnPicture).mockImplementation((from) => picture(from.height, from.width))
  vi.mocked(toJpeg).mockResolvedValue(CROPPED)
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  vi.mocked(loadPicture).mockReset()
  vi.mocked(turnPicture).mockReset()
  vi.mocked(paint).mockReset()
  vi.mocked(toJpeg).mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
  urls = 0
  revoked.length = 0
})

describe('ProfileScreen: choosing a photo', () => {
  it('opens the editor on the centred square and uploads only when saved', async () => {
    let sent: FormData | undefined
    serve({
      'PUT /api/users/me/avatar': (body) => {
        sent = body as FormData
        return json({ ...user, avatar_file_id: 'photo-1' })
      },
    })
    renderWithRouter(<ProfileScreen />)

    const editor = await openEditor()
    expect(loadPicture).toHaveBeenCalledWith(PICKED)
    expect(requests('PUT /api/users/me/avatar')).toHaveLength(0)
    await userEvent.click(within(editor).getByRole('button', { name: 'Guardar foto' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(saved()).toEqual({ size: [2000, 1200], rect: { x: 400, y: 0, side: 1200 } })
    const file = sent?.get('file') as File
    expect([file.name, file.type, await file.text()]).toEqual(['avatar.jpg', 'image/jpeg', 'cropped'])
    expect(sessionStore.get()?.user.avatar_file_id).toBe('photo-1')
    expect(await screen.findByRole('button', { name: 'Alterar foto' })).toBeInTheDocument()
    // What was sent is shown as it is: nothing is downloaded again.
    expect(requests('GET /api/files/photo-1/content')).toHaveLength(0)
  })

  it('saves what was zoomed and moved, and previews that same part', async () => {
    serve({ 'PUT /api/users/me/avatar': () => json({ ...user, avatar_file_id: 'photo-1' }) })
    renderWithRouter(<ProfileScreen />)

    const editor = await openEditor()
    expect(within(editor).getByRole('button', { name: 'Reduzir' })).toBeDisabled() // already whole
    await userEvent.click(within(editor).getByRole('button', { name: 'Ampliar' }))
    // The arrows move the picture: to the right, so the window shows more of its left.
    within(editor).getByRole('group', { name: /Posição da foto/ }).focus()
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.click(within(editor).getByRole('button', { name: 'Guardar foto' }))

    await waitFor(() => expect(toJpeg).toHaveBeenCalled())
    // Zoom 1.25: a 960 px window in the middle (520, 120), then 5% of it (48 px) to the left.
    expect(saved().rect).toEqual({ x: 472, y: 120, side: 960 })
    expect(vi.mocked(paint).mock.lastCall?.[2]).toEqual(saved().rect)
  })

  it('zooms with the slider, as far as a quarter of the picture', async () => {
    serve({ 'PUT /api/users/me/avatar': () => json({ ...user, avatar_file_id: 'photo-1' }) })
    renderWithRouter(<ProfileScreen />)

    const editor = await openEditor()
    fireEvent.change(within(editor).getByLabelText('Zoom'), { target: { value: '4' } })
    await waitFor(() => expect(within(editor).getByRole('button', { name: 'Ampliar' })).toBeDisabled())
    await userEvent.click(within(editor).getByRole('button', { name: 'Guardar foto' }))

    await waitFor(() => expect(toJpeg).toHaveBeenCalled())
    expect(saved().rect).toEqual({ x: 850, y: 450, side: 300 })
  })

  it('turns the picture and keeps the window on it', async () => {
    serve({ 'PUT /api/users/me/avatar': () => json({ ...user, avatar_file_id: 'photo-1' }) })
    renderWithRouter(<ProfileScreen />)

    const editor = await openEditor()
    await userEvent.click(within(editor).getByRole('button', { name: 'Rodar à direita' }))
    await userEvent.click(within(editor).getByRole('button', { name: 'Guardar foto' }))

    await waitFor(() => expect(toJpeg).toHaveBeenCalled())
    expect(turnPicture).toHaveBeenCalledWith(LANDSCAPE, 1)
    expect(saved()).toEqual({ size: [1200, 2000], rect: { x: 0, y: 400, side: 1200 } })
  })

  it('sends nothing when the editor is cancelled', async () => {
    serve({})
    renderWithRouter(<ProfileScreen />)

    const editor = await openEditor()
    await userEvent.click(within(editor).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toJpeg).not.toHaveBeenCalled()
    expect(requests('PUT /api/users/me/avatar')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Adicionar foto' })).toBeInTheDocument()
  })

  it('says when the browser cannot read the picture, without opening the editor', async () => {
    vi.mocked(loadPicture).mockRejectedValue(new UnreadableImageError())
    serve({})
    renderWithRouter(<ProfileScreen />)

    await screen.findByRole('button', { name: 'Adicionar foto' })
    await pick(PICKED)

    expect(await screen.findByText('Não conseguimos ler esta imagem. Tenta um JPG ou PNG.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the editor open, with the reason, when the server refuses the photo', async () => {
    let refuse = true
    serve({
      'PUT /api/users/me/avatar': () =>
        refuse
          ? json({ detail: 'File is larger than 1 MB', code: 'file_too_large' }, 413)
          : json({ ...user, avatar_file_id: 'photo-1' }),
    })
    renderWithRouter(<ProfileScreen />)

    const editor = await openEditor()
    await userEvent.click(within(editor).getByRole('button', { name: 'Guardar foto' }))
    expect(await within(editor).findByText('O ficheiro é demasiado grande.')).toBeInTheDocument()
    expect(sessionStore.get()?.user.avatar_file_id).toBeNull()

    refuse = false
    await userEvent.click(within(editor).getByRole('button', { name: 'Guardar foto' }))

    await waitFor(() => expect(sessionStore.get()?.user.avatar_file_id).toBe('photo-1'))
  })
})

describe('ProfileScreen: an account with a photo', () => {
  beforeEach(() => {
    sessionStore.set({ accessToken: 'access-1', user: { ...user, avatar_file_id: 'photo-1' } })
  })

  it('shows it and removes it', async () => {
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
    serve({
      'GET /api/files/photo-1/content': () => new Response(new Blob(['stored'], { type: 'image/jpeg' })),
      'PUT /api/users/me/avatar': () => json({ ...user, avatar_file_id: 'photo-2' }),
    })
    renderWithRouter(<ProfileScreen />)

    await waitFor(() => expect(requests('GET /api/files/photo-1/content')).toHaveLength(1))
    const editor = await openEditor()
    await userEvent.click(within(editor).getByRole('button', { name: 'Guardar foto' }))

    await waitFor(() => expect(sessionStore.get()?.user.avatar_file_id).toBe('photo-2'))
    expect(revoked).toEqual(['blob:photo-1'])
    expect(requests('GET /api/files/photo-2/content')).toHaveLength(0)
  })
})
