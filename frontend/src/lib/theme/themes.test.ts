/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PALETTES, type Palette } from './palettes'

// Read from disk: Vitest hands a stylesheet import back empty (and Vite rewrites a URL to it).
const read = (file: string) => readFileSync(resolve(process.cwd(), 'src', file), 'utf8')
const nocturneCss = read('index.css')
const themesCss = read('themes.css')

/** Every theme, in both modes, as the stylesheets define it: token name → colour. */
type Tokens = Record<string, string>

function block(css: string, selector: string): Tokens {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no block for ${selector}`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, name, value]) => [name, value]))
}

function tokens(palette: Palette, mode: 'dark' | 'light'): Tokens {
  if (palette === 'nocturne') {
    const selector = mode === 'dark' ? ".dark [data-palette='nocturne']" : "[data-palette='nocturne']"
    return block(nocturneCss, selector)
  }
  const selector = mode === 'dark' ? `.dark [data-palette='${palette}']` : `[data-palette='${palette}']`
  return block(themesCss, `\n${selector}`)
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio. */
function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

const THEMES = PALETTES.flatMap((palette) => (['dark', 'light'] as const).map((mode) => [palette, mode] as const))

/** What is read, on what, and the least it must reach (4.5: text; 3: a mark or a control). */
const PAIRS = [
  ['foreground', 'background', 7],
  ['card-foreground', 'card', 7],
  ['muted-foreground', 'card', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['primary', 'card', 3],
  ['accent-foreground', 'accent', 4.5],
  ['destructive', 'card', 3],
  ['warning', 'card', 3],
  ['heart', 'card', 3],
  ['chart-1', 'card', 3],
] as const

/**
 * Known before this test existed, and left as it was: Nocturne's light mode writes its filled
 * button at 4.09:1 (#f5f4ff on #796cbf). Darkening its accent is a design change of its own.
 */
const KNOWN = ['nocturne light: primary-foreground on primary']

describe('the themes', () => {
  it.each(THEMES)('%s %s defines every token Nocturne does', (palette, mode) => {
    expect(Object.keys(tokens(palette, mode)).sort()).toEqual(Object.keys(tokens('nocturne', mode)).sort())
  })

  it.each(THEMES)('%s %s can be read', (palette, mode) => {
    const theme = tokens(palette, mode)
    const short = PAIRS.filter(
      ([text, ground, least]) =>
        contrast(theme[text], theme[ground]) < least && !KNOWN.includes(`${palette} ${mode}: ${text} on ${ground}`),
    ).map(
      ([text, ground, least]) => `${text} on ${ground}: ${contrast(theme[text], theme[ground]).toFixed(2)} < ${least}`,
    )
    expect(short).toEqual([])
  })

  it.each(THEMES.filter(([palette]) => palette !== 'nocturne'))(
    '%s %s holds its text to the stricter 4.5:1',
    (palette, mode) => {
      const theme = tokens(palette, mode)
      for (const [text, ground] of [
        ['primary', 'background'],
        ['destructive', 'card'],
        ['warning', 'card'],
        ['muted-foreground', 'background'],
      ]) {
        expect(contrast(theme[text], theme[ground]), `${text} on ${ground}`).toBeGreaterThanOrEqual(4.5)
      }
    },
  )

  it('are told apart by their accent', () => {
    for (const mode of ['dark', 'light'] as const) {
      const accents = PALETTES.map((palette) => tokens(palette, mode).primary)
      expect(new Set(accents).size).toBe(PALETTES.length)
    }
  })
})
