/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_PALETTE, PALETTE_KEY, PALETTES } from './palettes'

const root = document.documentElement
const initScript = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8')
/** What the browser does with <script src="/theme-init.js"> before the app loads. */
const runInit = () => new Function(initScript)()

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  root.removeAttribute('data-palette')
  root.className = 'dark'
})

afterEach(() => {
  localStorage.clear()
  root.removeAttribute('data-palette')
  root.className = ''
})

describe('the theme this device chose', () => {
  it('is Nocturne until one is chosen', async () => {
    const { paletteStore } = await import('./palette')

    expect(paletteStore.get()).toBe(DEFAULT_PALETTE)
    expect(DEFAULT_PALETTE).toBe('nocturne')
  })

  it('is worn by the page and remembered', async () => {
    const { paletteStore } = await import('./palette')
    const heard = vi.fn()
    paletteStore.subscribe(heard)

    paletteStore.set('ferro')

    expect(root.dataset.palette).toBe('ferro')
    expect(localStorage.getItem(PALETTE_KEY)).toBe('ferro')
    expect(paletteStore.get()).toBe('ferro')
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('comes back on the next visit', async () => {
    localStorage.setItem(PALETTE_KEY, 'gelo')

    const { paletteStore, startTheme } = await import('./palette')
    startTheme()

    expect(paletteStore.get()).toBe('gelo')
    expect(root.dataset.palette).toBe('gelo')
  })

  it('falls back to Nocturne when what was stored is not a theme', async () => {
    localStorage.setItem(PALETTE_KEY, 'not-a-theme')

    const { paletteStore, startTheme } = await import('./palette')
    startTheme()

    expect(paletteStore.get()).toBe('nocturne')
    expect(root.dataset.palette).toBe('nocturne')
  })

  it('gives the browser’s own chrome the ground of the theme', async () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#161826'
    document.head.append(meta)
    const computed = vi.spyOn(window, 'getComputedStyle')
    computed.mockReturnValue({ getPropertyValue: () => ' #121113 ' } as unknown as CSSStyleDeclaration)

    const { paletteStore, startTheme } = await import('./palette')
    startTheme()
    expect(meta.content).toBe('#121113')

    computed.mockReturnValue({ getPropertyValue: () => '#f4f1ea' } as unknown as CSSStyleDeclaration)
    paletteStore.set('ferro')
    root.className = 'light' // the mode, as next-themes sets it
    await vi.waitFor(() => expect(meta.content).toBe('#f4f1ea'))

    computed.mockRestore()
    meta.remove()
  })
})

describe('theme-init.js, before the app loads', () => {
  it('leaves the page as served when nothing was chosen', () => {
    runInit()

    expect(root.hasAttribute('data-palette')).toBe(false)
    expect(root.className).toBe('dark')
  })

  it.each(PALETTES)('puts %s on the page', (palette) => {
    localStorage.setItem(PALETTE_KEY, palette)

    runInit()

    expect(root.dataset.palette).toBe(palette)
  })

  it('puts the light mode on the page', () => {
    localStorage.setItem('mygymtracker-theme', 'light')

    runInit()

    expect(root.classList.contains('dark')).toBe(false)
    expect(root.classList.contains('light')).toBe(true)
  })

  it('ignores a stored value that could not be a theme name', () => {
    localStorage.setItem(PALETTE_KEY, '"><script>alert(1)</script>')

    runInit()

    expect(root.hasAttribute('data-palette')).toBe(false)
  })

  it('uses the same key as the app', () => {
    expect(initScript).toContain(`'${PALETTE_KEY}'`)
  })
})
