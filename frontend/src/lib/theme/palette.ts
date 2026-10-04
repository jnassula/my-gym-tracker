/**
 * The theme family this device chose: kept in localStorage, worn by <html> as `data-palette`.
 * public/theme-init.js puts it there before the first paint; this module is the app's side.
 */
import { useSyncExternalStore } from 'react'

import { DEFAULT_PALETTE, isPalette, PALETTE_KEY, type Palette } from './palettes'

function stored(): Palette {
  try {
    const value = localStorage.getItem(PALETTE_KEY)
    return isPalette(value) ? value : DEFAULT_PALETTE
  } catch {
    return DEFAULT_PALETTE
  }
}

let current = stored()
const listeners = new Set<() => void>()

function wear(palette: Palette) {
  document.documentElement.dataset.palette = palette
}

export const paletteStore = {
  get: (): Palette => current,
  set(palette: Palette) {
    current = palette
    try {
      localStorage.setItem(PALETTE_KEY, palette)
    } catch {
      // Storage full or disabled: the choice lasts for this visit.
    }
    wear(palette)
    for (const listener of listeners) listener()
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function usePalette(): Palette {
  return useSyncExternalStore(paletteStore.subscribe, paletteStore.get)
}

/** The browser's own chrome (Android's status bar, the installed app's title bar) takes the
 * ground of whatever theme is on. */
function syncThemeColor() {
  const ground = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
  if (ground) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ground)
}

/**
 * Called once at startup: wears the stored family (in case the init script didn't run) and
 * keeps the theme-color in step with it and with the mode, whoever changes them (next-themes
 * sets the class in its own time, so the attributes are watched instead of the callers).
 */
export function startTheme() {
  wear(current)
  syncThemeColor()
  new MutationObserver(syncThemeColor).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-palette'],
  })
}
