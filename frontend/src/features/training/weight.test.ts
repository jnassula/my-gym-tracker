import { describe, expect, it } from 'vitest'

import { clampWeight, formatVolume, formatWeight, parseWeight, toKg, toUnit } from './weight'

describe('weight units', () => {
  it('keeps kg as stored and converts lb both ways without drift', () => {
    expect(toUnit(57.5, 'kg')).toBe(57.5)
    expect(toKg(135, 'lb')).toBe(61.23)
    expect(toUnit(toKg(135, 'lb'), 'lb')).toBe(135)
    expect(toUnit(100, 'lb')).toBe(220.5)
  })

  it('formats with the PT decimal comma and the unit', () => {
    expect(formatWeight(57.5, 'kg', 'pt')).toBe('57,5 kg')
    expect(formatWeight(60, 'kg', 'en')).toBe('60 kg')
    expect(formatWeight(61.23, 'lb', 'en')).toBe('135 lb')
  })

  it('shows volume in tonnes from 1000 kg', () => {
    expect(formatVolume(9840, 'kg', 'pt')).toBe('9,8 t')
    expect(formatVolume(850, 'kg', 'pt')).toBe('850 kg')
    expect(formatVolume(1000, 'lb', 'en')).toBe('2,205 lb')
  })

  it.each([
    ['57,5', 57.5],
    ['57.5', 57.5],
    [' 60 ', 60],
    ['0', 0],
    ['', null],
    ['abc', null],
    ['-5', null],
    ['1,234', null],
  ])('parses %j', (text, expected) => {
    expect(parseWeight(text)).toBe(expected)
  })

  it('stays between 0 and the API limit', () => {
    expect(clampWeight(-5, 'kg')).toBe(0)
    expect(clampWeight(1200, 'kg')).toBe(1000)
    expect(clampWeight(5000, 'lb')).toBe(2204.6)
  })
})
