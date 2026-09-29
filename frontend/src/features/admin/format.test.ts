import { describe, expect, it } from 'vitest'

import { difference, formatBucketTick, formatCount, formatInstantDay, formatMonthYear, percentOf } from './format'

describe('backoffice formatting', () => {
  it('rounds a share and survives an empty whole', () => {
    expect(percentOf(1, 3)).toBe(33)
    expect(percentOf(4, 4)).toBe(100)
    expect(percentOf(0, 0)).toBe(0)
  })

  it('compares with the period before', () => {
    expect(difference({ current: 5, previous: 8 })).toBe(-3)
  })

  it('groups thousands as the language does', () => {
    expect(formatCount(12840, 'pt')).toBe('12\u00a0840')
    expect(formatCount(12840, 'en')).toBe('12,840')
  })

  it('names a bucket by its first day, or by its month', () => {
    expect(formatBucketTick('2026-09-21', 'week', 'pt')).toBe('21 set.')
    expect(formatBucketTick('2026-09-01', 'month', 'pt')).toBe('set.')
    expect(formatMonthYear('2026-09-01', 'pt')).toBe('setembro de 2026')
  })

  it('puts an instant on the day of the time zone', () => {
    expect(formatInstantDay('2026-09-26T23:30:00Z', 'pt', 'Europe/Lisbon')).toBe('27 set. 2026')
    expect(formatInstantDay('2026-09-26T23:30:00Z', 'pt', 'America/Sao_Paulo')).toBe('26 set. 2026')
  })
})
