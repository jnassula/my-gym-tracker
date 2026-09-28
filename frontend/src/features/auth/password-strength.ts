export type Strength = {
  /** 0 = empty, 1 weak … 4 very strong: one meter segment per point. */
  score: 0 | 1 | 2 | 3 | 4
  /** The first thing to add, or null when the basic criteria are met. */
  missing: 'length' | 'number' | 'symbol' | null
}

const MIN_LENGTH = 8
const LONG_LENGTH = 12

/**
 * Guidance only: the server enforces length (8–128), not composition. Scoring follows the
 * design: 8+ characters with a number and a symbol is "strong", 12+ on top is "very strong".
 */
export function passwordStrength(password: string): Strength {
  if (!password) return { score: 0, missing: null }
  if (password.length < MIN_LENGTH) return { score: 1, missing: 'length' }

  const hasNumber = /\p{N}/u.test(password)
  const hasSymbol = /[^\p{L}\p{N}\s]/u.test(password)
  const isLong = password.length >= LONG_LENGTH
  const score = (1 + Number(hasNumber) + Number(hasSymbol) + Number(isLong)) as Strength['score']
  const missing = !hasNumber ? 'number' : !hasSymbol ? 'symbol' : null
  return { score, missing }
}
