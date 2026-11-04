import { afterEach, describe, expect, it, vi } from 'vitest'

import { lockPortrait } from './orientation'

afterEach(() => vi.unstubAllGlobals())

describe('lockPortrait', () => {
  it('asks the browser for portrait where it listens', async () => {
    const lock = vi.fn(() => Promise.resolve())
    vi.stubGlobal('screen', { orientation: { lock } })

    expect(await lockPortrait()).toBe(true)
    expect(lock).toHaveBeenCalledWith('portrait')
  })

  it('takes a refusal quietly (a plain tab, an iPhone)', async () => {
    vi.stubGlobal('screen', { orientation: { lock: () => Promise.reject(new Error('NotSupportedError')) } })
    expect(await lockPortrait()).toBe(false)

    vi.stubGlobal('screen', { orientation: {} })
    expect(await lockPortrait()).toBe(false)
  })
})
