/**
 * The themes the app can wear: Nocturne, its own, and the eight families of the Claude Design
 * canvas "myGymTracker Ferro". Each has a dark and a light mode (src/themes.css); the mode is
 * next-themes' business, the family is the `data-palette` attribute this module names.
 */
export const PALETTES = [
  'nocturne',
  'ferro',
  'lima',
  'gelo',
  'brasa',
  'ouro',
  'violeta',
  'menta',
  'grafite',
] as const

export type Palette = (typeof PALETTES)[number]

export const DEFAULT_PALETTE: Palette = 'nocturne'

/** Where this device remembers its family, beside next-themes' `mygymtracker-theme`. */
export const PALETTE_KEY = 'mygymtracker-palette'

export function isPalette(value: unknown): value is Palette {
  return (PALETTES as readonly unknown[]).includes(value)
}
