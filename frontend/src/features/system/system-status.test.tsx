import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SystemStatus } from './system-status'

function renderStatus() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SystemStatus />
    </QueryClientProvider>,
  )
}

function mockFetch(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn()
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response)
    else fetchMock.mockResolvedValueOnce(response)
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const json = (body: unknown, status = 200) => Response.json(body, { status })

describe('SystemStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the API and database as operational', async () => {
    mockFetch(json({ status: 'ok', version: '0.1.0', database: 'ok' }))

    renderStatus()

    expect(await screen.findAllByText('Operacional')).toHaveLength(2)
    expect(screen.getByText('0.1.0')).toBeInTheDocument()
  })

  it('shows a degraded API when the database is down (HTTP 503)', async () => {
    mockFetch(json({ status: 'degraded', version: '0.1.0', database: 'unavailable' }, 503))

    renderStatus()

    expect(await screen.findByText('Degradado')).toBeInTheDocument()
    expect(screen.getByText('Indisponível')).toBeInTheDocument()
  })

  it('shows the API as unavailable when it cannot be reached, and retries on demand', async () => {
    const fetchMock = mockFetch(
      new TypeError('Failed to fetch'),
      json({ status: 'ok', version: '0.1.0', database: 'ok' }),
    )

    renderStatus()
    expect(await screen.findByText('Indisponível')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Verificar novamente' }))

    expect(await screen.findAllByText('Operacional')).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
