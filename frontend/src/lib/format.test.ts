import { describe, expect, it } from 'vitest'

import { intlLocale } from '@/i18n'

import { formatDayMonth } from './format'

describe('dates and locales', () => {
  it('writes a day and a short month in each language', () => {
    expect(formatDayMonth('2026-09-23', 'pt')).toBe('23 set.')
    expect(formatDayMonth('2026-09-23', 'en')).toBe('23 Sept')
    expect(formatDayMonth('2026-09-23', 'es')).toBe('23 sept')
    expect(formatDayMonth('2026-04-15', 'pt', true)).toBe('15 abr. 2026')
  })

  it('formats for each language’s home region', () => {
    expect(intlLocale('pt')).toBe('pt-PT')
    expect(intlLocale('en')).toBe('en-GB')
    expect(intlLocale('xx')).toBe('pt-PT')
  })
})
