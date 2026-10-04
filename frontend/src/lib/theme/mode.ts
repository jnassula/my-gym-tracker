import { useTheme } from 'next-themes'

export type Mode = 'dark' | 'light'

/** What next-themes resolved, as one of the two modes every theme has. */
export function useMode(): Mode {
  return useTheme().resolvedTheme === 'light' ? 'light' : 'dark'
}
