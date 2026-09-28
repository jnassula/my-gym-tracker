import { describe, expect, it } from 'vitest'

import en from './locales/en.json'
import es from './locales/es.json'
import pt from './locales/pt.json'

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('locales', () => {
  it.each([
    ['en', en],
    ['es', es],
  ])('%s has exactly the same keys as pt', (_, locale) => {
    expect(keys(locale).sort()).toEqual(keys(pt).sort())
  })

  it('has no empty strings', () => {
    for (const locale of [pt, en, es]) {
      const values = keys(locale).map((path) =>
        path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], locale),
      )
      expect(values.filter((value) => value === '')).toEqual([])
    }
  })
})
