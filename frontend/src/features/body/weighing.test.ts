import { describe, expect, it } from 'vitest'

import type { Frame } from './scale-frame'
import { IDLE, IMPEDANCE_WAIT_MS, weigh, type Weighing, type WeighingEvent } from './weighing'

const frame = (changes: Partial<Frame> = {}, at = 0): WeighingEvent => ({
  type: 'frame',
  frame: { weightKg: 78.45, impedance: null, stable: false, removed: false, ...changes },
  at,
})

const run = (events: WeighingEvent[], from: Weighing = IDLE) => events.reduce(weigh, from)

const connected = run([{ type: 'connect' }, { type: 'connected' }])

describe('weigh', () => {
  it('goes from connecting to waiting for someone to step on', () => {
    expect(run([{ type: 'connect' }])).toEqual({ phase: 'connecting' })
    expect(connected).toEqual({ phase: 'waiting' })
  })

  it('follows the weight while it moves and takes the settled one with its impedance', () => {
    expect(run([frame({ weightKg: 60.2 }), frame({ weightKg: 78.4 })], connected)).toEqual({
      phase: 'measuring',
      weightKg: 78.4,
    })
    expect(run([frame({ weightKg: 78.4 }), frame({ stable: true, impedance: 480 })], connected)).toEqual({
      phase: 'done',
      weightKg: 78.45,
      impedance: 480,
    })
  })

  it('waits a moment for the impedance, then takes the weight alone', () => {
    const settled = run([frame({ stable: true }, 1000), frame({ stable: true }, 2500)], connected)
    expect(settled).toEqual({ phase: 'settled', weightKg: 78.45, since: 1000 })

    expect(weigh(settled, { type: 'tick', at: 1000 + IMPEDANCE_WAIT_MS - 1 })).toBe(settled)
    expect(weigh(settled, { type: 'tick', at: 1000 + IMPEDANCE_WAIT_MS })).toEqual({
      phase: 'done',
      weightKg: 78.45,
      impedance: null,
    })
    expect(weigh(settled, frame({ stable: true, impedance: 480 }, 3000))).toEqual({
      phase: 'done',
      weightKg: 78.45,
      impedance: 480,
    })
  })

  it('starts over when the person steps off before a reading', () => {
    const measuring = run([frame()], connected)

    expect(weigh(measuring, frame({ removed: true }))).toEqual({ phase: 'waiting' })
    expect(weigh(measuring, frame({ weightKg: 0 }))).toEqual({ phase: 'waiting' })
  })

  it('keeps the reading whatever the scale says afterwards', () => {
    const done = run([frame({ stable: true, impedance: 480 })], connected)

    expect(weigh(done, frame({ removed: true }))).toBe(done)
    expect(weigh(done, frame({ weightKg: 80, stable: true, impedance: 500 }))).toBe(done)
    // The scale switches off once it has its reading.
    expect(weigh(done, { type: 'failed', reason: 'failed' })).toBe(done)
  })

  it('stops with the reason when the scale is not reached', () => {
    expect(run([{ type: 'connect' }, { type: 'failed', reason: 'cancelled' }])).toEqual({
      phase: 'error',
      reason: 'cancelled',
    })
    expect(weigh(connected, { type: 'failed', reason: 'failed' })).toEqual({ phase: 'error', reason: 'failed' })
  })

  it('ignores frames before connecting and starts again on reset', () => {
    expect(weigh(IDLE, frame())).toBe(IDLE)
    expect(weigh({ phase: 'error', reason: 'failed' }, { type: 'reset' })).toBe(IDLE)
  })
})
