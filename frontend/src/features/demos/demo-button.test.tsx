import { QueryClient } from '@tanstack/react-query'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { json, renderWithRouter, user } from '@/test/render'

import { demoGifQuery, releaseDemos } from './api'
import { DemoButton } from './demo-button'

const fetchMock = vi.fn<typeof fetch>()
const gif = () => new Response(new Blob(['GIF89a'], { type: 'image/gif' }))

function serve(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (input) => {
    const handler = routes[String(input)]
    if (!handler) throw new Error(`Unexpected request: ${String(input)}`)
    return handler()
  })
}

const requested = (path: string) => fetchMock.mock.calls.filter(([input]) => String(input) === path).length

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => 'blob:demo')
  URL.revokeObjectURL = vi.fn()
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

describe('DemoButton', () => {
  const button = () => screen.findByRole('button', { name: 'Como fazer' })

  it('shows nothing for an exercise without an animation', async () => {
    serve({ '/api/demos/exercises/ex-1': () => json(null) })
    renderWithRouter(<DemoButton exerciseId="ex-1" name="Esteira" />)

    await waitFor(() => expect(requested('/api/demos/exercises/ex-1')).toBe(1))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens the animation, with what it shows and whose it is', async () => {
    serve({
      '/api/demos/exercises/ex-2': () => json({ id: 'my33uHU', name: 'lever leg extension' }),
      '/api/demos/my33uHU.gif': gif,
    })
    renderWithRouter(<DemoButton exerciseId="ex-2" name="Cadeira Extensora" />)

    await userEvent.click(await button())

    const sheet = await screen.findByRole('dialog', { name: 'Como fazer' })
    expect(within(sheet).getByText('Cadeira Extensora')).toBeInTheDocument()
    const picture = await within(sheet).findByRole('img', { name: 'Animação do exercício Cadeira Extensora' })
    expect(picture).toHaveAttribute('src', 'blob:demo')
    expect(within(sheet).getByText('A animação mostra: lever leg extension')).toBeInTheDocument()
    expect(within(sheet).getByText('Animações: ExerciseDB, da AscendAPI')).toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('only fetches the animation once it is asked for, and once', async () => {
    serve({
      '/api/demos/exercises/ex-2': () => json({ id: 'my33uHU', name: 'lever leg extension' }),
      '/api/demos/my33uHU.gif': gif,
    })
    renderWithRouter(<DemoButton exerciseId="ex-2" name="Cadeira Extensora" />)
    const open = await button()
    expect(requested('/api/demos/my33uHU.gif')).toBe(0)

    await userEvent.click(open)
    await screen.findByRole('img')
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(open)
    await screen.findByRole('img')

    expect(requested('/api/demos/my33uHU.gif')).toBe(1)
  })

  it('says so when the animation cannot be fetched', async () => {
    serve({
      '/api/demos/exercises/ex-2': () => json({ id: 'my33uHU', name: 'lever leg extension' }),
      '/api/demos/my33uHU.gif': () => json({ detail: 'Not found', code: 'demo_not_found' }, 404),
    })
    renderWithRouter(<DemoButton exerciseId="ex-2" name="Cadeira Extensora" />)

    await userEvent.click(await button())

    expect(await screen.findByText('Esta animação não está disponível.')).toBeInTheDocument()
  })
})

describe('releaseDemos', () => {
  it('lets go of every animation the tab was holding', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(demoGifQuery('a').queryKey, 'blob:a')
    queryClient.setQueryData(demoGifQuery('b').queryKey, 'blob:b')

    releaseDemos(queryClient)

    expect(vi.mocked(URL.revokeObjectURL).mock.calls).toEqual([['blob:a'], ['blob:b']])
  })
})
