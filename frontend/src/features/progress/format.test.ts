import { describe, expect, it } from 'vitest'

import {
  formatDuration,
  formatMonth,
  formatShortDate,
  formatSigned,
  formatWeightChange,
  percentChange,
  shiftMonth,
} from './format'

describe('progress formatting', () => {
  it('writes durations as minutes, then hours', () => {
    expect(formatDuration(3120)).toBe('52 min')
    expect(formatDuration(18720)).toBe('5 h 12')
    expect(formatDuration(3600 + 5 * 60)).toBe('1 h 05')
  })

  it('signs changes with a real minus sign', () => {
    expect(formatSigned(2.5, 'pt')).toBe('+2,5')
    expect(formatSigned(-5, 'pt')).toBe('−5')
    expect(formatSigned(0, 'pt')).toBe('0')
    expect(formatWeightChange(12.5, 'kg', 'pt')).toBe('+12,5 kg')
  })

  it('formats and moves between months', () => {
    expect(formatShortDate('2026-09-23', 'pt')).toBe('23 de set.')
    expect(formatMonth('2026-09-01', 'pt')).toBe('setembro de 2026')
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01')
  })

  it('compares with nothing as null', () => {
    expect(percentChange(105, 100)).toBe(5)
    expect(percentChange(10, 0)).toBeNull()
  })
})
