import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { isTheme, ThemeContext, type Theme } from './theme-context'

const STORAGE_KEY = 'mygymtracker-theme'

function readStoredTheme(fallback: Theme): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : fallback
  } catch {
    return fallback // storage can be blocked (private mode, strict settings)
  }
}

type ThemeProviderProps = {
  children: ReactNode
  defaultTheme?: Theme
}

export function ThemeProvider({ children, defaultTheme = 'dark' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme(defaultTheme))

  useEffect(() => {
    const root = document.documentElement
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme
    root.classList.remove('light', 'dark')
    root.classList.add(resolved)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      setTheme: (next: Theme) => {
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // Preference just won't persist.
        }
        setThemeState(next)
      },
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
