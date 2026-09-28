import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { remaining, restTimer } from './rest-timer'

const secondsLeft = () => Math.ceil(remaining({ ...restTimer.get(), now: Date.now() }) / 1000)

describe('rest timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T18:00:00Z'))
  })

  afterEach(() => {
    restTimer.skip()
    vi.useRealTimers()
  })

  it('counts down from the rest it was started with and opens the sheet', () => {
    restTimer.start(80)
    vi.advanceTimersByTime(30_000)

    expect(restTimer.get().open).toBe(true)
    expect(secondsLeft()).toBe(50)
  })

  it('pauses, resumes and adjusts by 15 s', () => {
    restTimer.start(60)
    vi.advanceTimersByTime(10_000)
    restTimer.pause()
    vi.advanceTimersByTime(60_000)

    expect(secondsLeft()).toBe(50)

    restTimer.resume()
    restTimer.adjust(15)
    expect(secondsLeft()).toBe(65)
    expect(restTimer.get().total).toBe(65) // past the total: it grows
    restTimer.adjust(-15)
    restTimer.adjust(-100)
    expect(secondsLeft()).toBe(0)
  })

  it('buzzes once when the rest runs out', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    restTimer.start(5)

    vi.advanceTimersByTime(4_000)
    expect(vibrate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_000)

    expect(vibrate).toHaveBeenCalledOnce()
    expect(secondsLeft()).toBe(0)
    vi.unstubAllGlobals()
  })

  it('skipping stops it and closes the sheet', () => {
    restTimer.start(90)
    restTimer.skip()

    expect(restTimer.get()).toMatchObject({ endsAt: null, pausedLeft: null, open: false })
  })
})
