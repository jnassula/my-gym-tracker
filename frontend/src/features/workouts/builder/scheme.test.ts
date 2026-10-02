import { describe, expect, it } from 'vitest'

import { clampRest, clampSets, isProgression, joinReps, matchesPreset, PRESETS, repsPerSet } from './scheme'

describe('reps per set', () => {
  it('spreads one figure over every set', () => {
    expect(repsPerSet('12', 3)).toEqual(['12', '12', '12'])
  })

  it('cuts or extends a progression to the number of sets', () => {
    expect(repsPerSet('15/12/10/8', 3)).toEqual(['15', '12', '10'])
    expect(repsPerSet('15/12', 4)).toEqual(['15', '12', '12', '12'])
    expect(repsPerSet(null, 2)).toEqual(['', ''])
  })

  it('joins back to the shortest scheme', () => {
    expect(joinReps(['12', '12', '12'])).toBe('12')
    expect(joinReps(['15', '12', '10', '8'])).toBe('15/12/10/8')
    expect(joinReps([' 8-12 ', '8-12'])).toBe('8-12')
    expect(joinReps(['', ''])).toBeNull()
    expect(joinReps(Array.from({ length: 12 }, (_, i) => String(100 + i)))).toHaveLength(32)
  })

  it('tells a progression from a plain scheme', () => {
    expect(isProgression('15/12/10')).toBe(true)
    expect(isProgression('8-12')).toBe(false)
    expect(isProgression(null)).toBe(false)
  })
})

describe('steppers', () => {
  it('keeps sets between 1 and 12 and rest on 15 s steps up to 10 min', () => {
    expect(clampSets(0)).toBe(1)
    expect(clampSets(13)).toBe(12)
    expect(clampRest(-15)).toBe(0)
    expect(clampRest(80)).toBe(75)
    expect(clampRest(900)).toBe(600)
  })

  it('matches a preset only when sets and reps are both its own', () => {
    expect(matchesPreset({ sets: 3, reps: '12' }, PRESETS[0])).toBe(true)
    expect(matchesPreset({ sets: 3, reps: '10' }, PRESETS[0])).toBe(false)
    expect(matchesPreset({ sets: null, reps: null }, PRESETS[0])).toBe(false)
  })
})
