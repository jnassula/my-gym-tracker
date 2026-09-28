import { describe, expect, it } from 'vitest'

import { formatFileSize, formatRest, formatScheme, groupByMuscle } from './format'

const labels = { setsOnly: (sets: number) => `${sets} séries` }

describe('formatRest', () => {
  it.each([
    [90, null, '1:30'],
    [40, null, '0:40'],
    [60, 120, '1–2 min'],
    [45, 90, '0:45–1:30'],
    [null, null, null],
  ])('%s–%s → %s', (min, max, expected) => {
    expect(formatRest(min, max)).toBe(expected)
  })
})

describe('formatScheme', () => {
  it.each([
    [{ sets: 3, reps: '8-12', rest_seconds: 90, rest_max_seconds: null }, '3×8–12 · 1:30'],
    [{ sets: 5, reps: '15/12/10/8/6-8', rest_seconds: null, rest_max_seconds: null }, '5×15/12/10/8/6–8'],
    [{ sets: 2, reps: null, rest_seconds: 60, rest_max_seconds: 120 }, '2 séries · 1–2 min'],
    [{ sets: null, reps: '30 min', rest_seconds: null, rest_max_seconds: null }, '30 min'],
    [{ sets: null, reps: null, rest_seconds: null, rest_max_seconds: null }, ''],
  ])('%j → %s', (exercise, expected) => {
    expect(formatScheme(exercise, labels)).toBe(expected)
  })
})

describe('formatFileSize', () => {
  it.each([
    [1_258_291, 'pt', '1,2 MB'],
    [1_258_291, 'en', '1.2 MB'],
    [68_000, 'pt', '66 KB'],
    [100, 'pt', '1 KB'],
  ])('%i bytes in %s → %s', (bytes, locale, expected) => {
    expect(formatFileSize(bytes, locale)).toBe(expected)
  })
})

describe('groupByMuscle', () => {
  it('groups in order of first appearance, keeping the order inside each group', () => {
    const exercises = [
      { name: 'Esteira', muscle_group: 'warmup' as const },
      { name: 'Supino', muscle_group: 'chest' as const },
      { name: 'Elevação', muscle_group: 'shoulders' as const },
      { name: 'Crucifixo', muscle_group: 'chest' as const },
      { name: '?', muscle_group: null },
    ]

    expect(groupByMuscle(exercises).map((g) => [g.group, g.exercises.map((e) => e.name)])).toEqual([
      ['warmup', ['Esteira']],
      ['chest', ['Supino', 'Crucifixo']],
      ['shoulders', ['Elevação']],
      [null, ['?']],
    ])
  })
})
