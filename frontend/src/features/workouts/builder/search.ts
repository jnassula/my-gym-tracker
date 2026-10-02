/** The builder's URL state (`/workouts/new?step=2&day=1`). */

export type Step = 1 | 2 | 3
export const STEPS: readonly Step[] = [1, 2, 3]

export type BuilderSearch = {
  step?: Step
  /** Index of the day open in step 2. */
  day?: number
  /** Start from a copy of this plan. */
  duplicate?: string
  /** Start over, dropping the draft saved on this device. */
  fresh?: boolean
}
