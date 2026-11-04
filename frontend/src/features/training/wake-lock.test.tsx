import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useWakeLock } from './wake-lock'

function Keeper({ active }: { active: boolean }) {
  useWakeLock(active)
  return null
}

const release = vi.fn(() => Promise.resolve())
const request = vi.fn(() => Promise.resolve({ release }))

beforeEach(() => {
  vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  request.mockClear()
  release.mockClear()
})

describe('useWakeLock', () => {
  it('keeps the screen on while active, and lets it go after', async () => {
    const { rerender } = render(<Keeper active />)

    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
    rerender(<Keeper active={false} />)
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1))
  })

  it('asks nothing while idle', () => {
    render(<Keeper active={false} />)

    expect(request).not.toHaveBeenCalled()
  })

  it('asks again when the page comes back into view (the browser lets go while hidden)', async () => {
    render(<Keeper active />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })

  it('does without where there is no wake lock, or when it is refused', async () => {
    vi.stubGlobal('navigator', { ...navigator, wakeLock: undefined })
    expect(() => render(<Keeper active />)).not.toThrow()
    cleanup()
    request.mockRejectedValueOnce(new Error('NotAllowedError'))
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } })

    render(<Keeper active />)

    await waitFor(() => expect(request).toHaveBeenCalled())
  })
})
