import { createContext } from 'react'

export const THEMES = ['dark', 'light', 'system'] as const
export type Theme = (typeof THEMES)[number]

export type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeState | null>(null)

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}
