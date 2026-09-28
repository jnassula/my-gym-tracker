/**
 * The rest timer between sets: one per app, shown by the header pill and the rest sheet.
 *
 * It keeps the instant it ends rather than counting ticks, so a phone that sleeps mid-rest
 * still shows the right time, and it survives a reload through localStorage (a per-device
 * convenience; losing it only loses the countdown). While it runs, the store itself ticks
 * `now` four times a second, so components render from state alone.
 */
import { useSyncExternalStore } from 'react'

import { DEFAULT_REST_SECONDS } from './plan'

export type RestState = {
  /** Length of this rest, in seconds. */
  total: number
  /** Epoch ms when it ends, while running (in the past once it has run out). */
  endsAt: number | null
  /** Milliseconds left, while paused. */
  pausedLeft: number | null
  /** Whether the rest sheet is showing. */
  open: boolean
  /** The time the state was last computed at (epoch ms). */
  now: number
}

const STORAGE_KEY = 'mygymtracker-rest'
const TICK_MS = 250

function load(): RestState {
  const idle = { total: DEFAULT_REST_SECONDS, endsAt: null, pausedLeft: null, open: false, now: Date.now() }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<RestState> | null
    if (saved && typeof saved.total === 'number') {
      return {
        ...idle,
        total: saved.total,
        endsAt: typeof saved.endsAt === 'number' ? saved.endsAt : null,
        pausedLeft: typeof saved.pausedLeft === 'number' ? saved.pausedLeft : null,
      }
    }
  } catch {
    // Storage blocked or corrupt: start idle.
  }
  return idle
}

let state = load()
let ticker: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()
// "Fim do descanso" (Notificações): vibrate and beep when a rest runs out.
let alertsOn = true

/** Two short beeps, where the browser allows audio (the tap that logged the set unlocked it). */
function beep() {
  try {
    const context = new AudioContext()
    for (const start of [0, 0.25]) {
      const tone = context.createOscillator()
      const volume = context.createGain()
      tone.frequency.value = 880
      volume.gain.setValueAtTime(0.2, context.currentTime + start)
      volume.gain.exponentialRampToValueAtTime(0.001, context.currentTime + start + 0.18)
      tone.connect(volume).connect(context.destination)
      tone.start(context.currentTime + start)
      tone.stop(context.currentTime + start + 0.2)
    }
    setTimeout(() => void context.close(), 1000)
  } catch {
    // No audio here: the vibration and the screen still say it.
  }
}

function notify() {
  for (const listener of listeners) listener()
}

function isRunning(rest: RestState): boolean {
  return rest.endsAt !== null && rest.endsAt > rest.now
}

/** Ticks while the rest runs, and buzzes once when it runs out (where devices can vibrate). */
function syncTicker() {
  if (isRunning(state) && ticker === undefined) {
    ticker = setInterval(() => {
      state = { ...state, now: Date.now() }
      if (!isRunning(state)) {
        clearInterval(ticker)
        ticker = undefined
        if (state.endsAt !== null && alertsOn) {
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
          beep()
        }
      }
      notify()
    }, TICK_MS)
  } else if (!isRunning(state) && ticker !== undefined) {
    clearInterval(ticker)
    ticker = undefined
  }
}

function update(next: Partial<RestState>) {
  state = { ...state, ...next, now: Date.now() }
  try {
    const { total, endsAt, pausedLeft } = state
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ total, endsAt, pausedLeft }))
  } catch {
    // Not saved: the timer still works for this page.
  }
  syncTicker()
  notify()
}

syncTicker()

/** Milliseconds left. */
export function remaining(rest: RestState): number {
  if (rest.endsAt !== null) return Math.max(0, rest.endsAt - rest.now)
  return rest.pausedLeft ?? 0
}

export const restTimer = {
  get: (): RestState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** A new rest of `seconds`, shown in the sheet. */
  start(seconds: number) {
    update({ total: seconds, endsAt: Date.now() + seconds * 1000, pausedLeft: null, open: true })
  },
  pause() {
    if (state.endsAt === null) return
    update({ pausedLeft: Math.max(0, state.endsAt - Date.now()), endsAt: null })
  },
  resume() {
    if (state.pausedLeft === null) return
    update({ endsAt: Date.now() + state.pausedLeft, pausedLeft: null })
  },
  restart() {
    update({ endsAt: Date.now() + state.total * 1000, pausedLeft: null })
  },
  /** ±15 s buttons. Adding past the total makes it the new total. */
  adjust(seconds: number) {
    const left = Math.max(0, remaining({ ...state, now: Date.now() }) + seconds * 1000)
    const total = Math.max(state.total, Math.ceil(left / 1000))
    if (state.pausedLeft !== null) update({ pausedLeft: left, total })
    else update({ endsAt: Date.now() + left, total })
  },
  /** "Saltar descanso": stops the timer and closes the sheet. */
  skip() {
    update({ endsAt: null, pausedLeft: null, open: false })
  },
  show() {
    update({ open: true })
  },
  /** Whether the end of a rest vibrates and beeps. */
  setAlerts(on: boolean) {
    alertsOn = on
  },
  hide() {
    update({ open: false })
  },
}

export function useRestTimer() {
  const rest = useSyncExternalStore(restTimer.subscribe, restTimer.get)
  const leftMs = remaining(rest)
  return {
    rest,
    /** Whole seconds left, rounded up (shows 0:01 until it really is over). */
    left: Math.ceil(leftMs / 1000),
    running: isRunning(rest),
    paused: rest.pausedLeft !== null,
  }
}
