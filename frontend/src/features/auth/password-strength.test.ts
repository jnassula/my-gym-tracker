import { describe, expect, it } from 'vitest'

import { passwordStrength } from './password-strength'

describe('passwordStrength', () => {
  it.each([
    ['', 0, null],
    ['abc1!', 1, 'length'],
    ['treinando', 1, 'number'],
    ['treino2026', 2, 'symbol'],
    ['treino-top', 2, 'number'],
    ['treino-forte', 3, 'number'], // 12+ characters count even without a number
    // The design's examples: "Treino2026!" is strong (3 of 4 segments).
    ['Treino2026!', 3, null],
    ['Treino2026!Forte', 4, null],
  ] as const)('%j scores %i (missing: %s)', (password, score, missing) => {
    expect(passwordStrength(password)).toEqual({ score, missing })
  })

  it('treats accented letters as letters, not symbols', () => {
    expect(passwordStrength('palavrãopasse1').missing).toBe('symbol')
  })
})
