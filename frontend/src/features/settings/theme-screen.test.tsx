import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { paletteStore } from '@/lib/theme/palette'
import { PALETTE_KEY, PALETTES } from '@/lib/theme/palettes'
import { json, renderWithRouter, user } from '@/test/render'

import { SettingsScreen } from './settings-screen'
import { ThemeScreen } from './theme-screen'

const root = document.documentElement

/** The app's own provider (main.tsx): the mode is next-themes', on the class of <html>. */
const themed = (ui: React.ReactNode) =>
  renderWithRouter(
    <ThemeProvider attribute="class" defaultTheme="dark" storageKey="mygymtracker-theme">
      {ui}
    </ThemeProvider>,
  )

beforeEach(() => {
  // jsdom has no matchMedia, which next-themes asks for the system's preference.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }))
  sessionStore.set({ accessToken: 'access-1', user })
})

afterEach(() => {
  cleanup()
  paletteStore.set('nocturne')
  localStorage.clear()
  root.className = ''
  sessionStore.set(null)
  vi.unstubAllGlobals()
})

describe('ThemeScreen', () => {
  it('offers every theme, each drawn with its own colours', async () => {
    themed(<ThemeScreen />)

    const options = await screen.findAllByRole('radio')
    expect(options).toHaveLength(PALETTES.length)
    expect(screen.getByRole('radio', { name: /Nocturne/ })).toBeChecked()
    for (const palette of PALETTES) {
      expect(document.querySelector(`[aria-hidden][data-palette="${palette}"]`)).not.toBeNull()
    }
  })

  it('wears the chosen theme at once and remembers it on this device', async () => {
    themed(<ThemeScreen />)

    await userEvent.click(await screen.findByRole('radio', { name: /Ferro/ }))

    expect(root.dataset.palette).toBe('ferro')
    expect(localStorage.getItem(PALETTE_KEY)).toBe('ferro')
    expect(screen.getByRole('radio', { name: /Ferro/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Nocturne/ })).not.toBeChecked()
  })

  it('switches between dark and light, whatever the theme', async () => {
    themed(<ThemeScreen />)
    await userEvent.click(await screen.findByRole('radio', { name: /Gelo/ }))
    const mode = screen.getByRole('group', { name: 'Modo' })

    await userEvent.click(within(mode, 'Claro'))

    await waitFor(() => expect(root.classList.contains('light')).toBe(true))
    expect(root.dataset.palette).toBe('gelo')
    expect(localStorage.getItem('mygymtracker-theme')).toBe('light')

    await userEvent.click(within(mode, 'Escuro'))
    await waitFor(() => expect(root.classList.contains('dark')).toBe(true))
  })
})

const within = (group: HTMLElement, name: string) =>
  [...group.querySelectorAll('button')].find((button) => button.textContent === name)!

describe('SettingsScreen', () => {
  it('says which theme is on and leads to the choice', async () => {
    vi.stubGlobal('fetch', async () => json([]))
    paletteStore.set('brasa')
    themed(<SettingsScreen />)

    const row = await screen.findByRole('link', { name: /Tema/ })

    expect(row).toHaveTextContent('Brasa · Escuro')
    expect(row).toHaveAttribute('href', '/settings/theme')
  })
})
