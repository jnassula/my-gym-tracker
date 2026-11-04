import { useEffect } from 'react'

/**
 * Keeps the screen on while `active` (a rest is running: the phone lies on the bench and the
 * countdown must stay in view). The Screen Wake Lock is let go by the browser whenever the
 * page is hidden, so it is asked for again when the page shows; where there is none (old
 * browsers) nothing happens.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let over = false
    const acquire = async () => {
      if (over || document.visibilityState !== 'visible') return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (over) await lock.release()
        else sentinel = lock
      } catch {
        // Refused (low battery, a browser setting): the screen then sleeps as it would.
      }
    }
    const onVisibility = () => void acquire()
    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      over = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release()
    }
  }, [active])
}
