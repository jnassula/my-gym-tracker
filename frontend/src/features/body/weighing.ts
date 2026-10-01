/** A weighing on the scale, from connecting to the reading (pure: the screen feeds it events). */
import type { Frame } from './scale-frame'

/** Why a weighing stopped: the chooser was closed, Bluetooth is off, or the scale went away. */
export type ScaleError = 'cancelled' | 'unavailable' | 'failed'

export type Reading = { weightKg: number; impedance: number | null }

export type Weighing =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  /** Connected: waiting for someone to step on. */
  | { phase: 'waiting' }
  /** The weight is still moving. */
  | { phase: 'measuring'; weightKg: number }
  /** The weight settled; the impedance takes a moment more (`since`, in ms). */
  | { phase: 'settled'; weightKg: number; since: number }
  /** The reading, to be saved. */
  | ({ phase: 'done' } & Reading)
  | { phase: 'error'; reason: ScaleError }

export type WeighingEvent =
  | { type: 'connect' }
  | { type: 'connected' }
  | { type: 'frame'; frame: Frame; at: number }
  | { type: 'tick'; at: number }
  | { type: 'failed'; reason: ScaleError }
  | { type: 'reset' }

export const IDLE: Weighing = { phase: 'idle' }
/** How long a settled weight waits for its impedance before it is saved without one (shoes on,
 * or a scale that measures none). */
export const IMPEDANCE_WAIT_MS = 5000
/** Below this nobody is standing on the scale (and the API takes nothing lighter). */
const MIN_KG = 10

export function weigh(state: Weighing, event: WeighingEvent): Weighing {
  switch (event.type) {
    case 'reset':
      return IDLE
    case 'connect':
      return { phase: 'connecting' }
    case 'failed':
      // A reading already taken is kept: the scale switches itself off right after.
      return state.phase === 'done' ? state : { phase: 'error', reason: event.reason }
    case 'connected':
      return state.phase === 'connecting' ? { phase: 'waiting' } : state
    case 'tick':
      return state.phase === 'settled' && event.at - state.since >= IMPEDANCE_WAIT_MS
        ? { phase: 'done', weightKg: state.weightKg, impedance: null }
        : state
    case 'frame': {
      if (state.phase === 'idle' || state.phase === 'done' || state.phase === 'error') return state
      const { frame } = event
      if (frame.removed || frame.weightKg < MIN_KG) return { phase: 'waiting' }
      if (!frame.stable) return { phase: 'measuring', weightKg: frame.weightKg }
      if (frame.impedance !== null) return { phase: 'done', weightKg: frame.weightKg, impedance: frame.impedance }
      // Still the same settled weight: keep counting from when it settled.
      const since = state.phase === 'settled' && state.weightKg === frame.weightKg ? state.since : event.at
      return { phase: 'settled', weightKg: frame.weightKg, since }
    }
  }
}
