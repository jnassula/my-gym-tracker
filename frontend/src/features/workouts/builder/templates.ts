/** The classic splits offered in step 1 ("Modelo"): group cards per day, no exercises. */
import type { Structure } from './draft'

export const TEMPLATES = ['fullbody', 'ppl', 'upperlower'] as const
export type Template = (typeof TEMPLATES)[number]

const FULL_BODY: Structure = [
  { groups: ['warmup', 'quads', 'hamstrings', 'chest', 'back', 'shoulders', 'abs'] },
]

const PUSH_PULL_LEGS: Structure = [
  { groups: ['warmup', 'chest', 'shoulders', 'triceps'] },
  { groups: ['warmup', 'back', 'biceps', 'forearms'] },
  { groups: ['warmup', 'quads', 'hamstrings', 'glutes', 'calves'] },
]

const UPPER_LOWER: Structure = [
  { groups: ['warmup', 'chest', 'back', 'shoulders', 'biceps', 'triceps'] },
  { groups: ['warmup', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'] },
]

/** Laid over the training days in order; a 4-day PPL repeats push on the fourth day. */
export const STRUCTURES: Record<Template, Structure> = {
  fullbody: FULL_BODY,
  ppl: PUSH_PULL_LEGS,
  upperlower: UPPER_LOWER,
}
