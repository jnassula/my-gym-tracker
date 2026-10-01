import type { Range } from '@/features/progress/types'

/** Typed in, read from the scale over Bluetooth, or sent by a data source's bridge. */
export type MeasurementSource = 'manual' | 'scale' | 'apple_health' | 'health_connect'

/** One weighing. The composition figures are worked out by the server from the scale's
 * impedance and the profile (height, age, sex); `body_fat_pct` may also be typed in. */
export type Measurement = {
  id: string
  measured_at: string
  source: MeasurementSource
  /** kg, like every weight from the API. */
  weight: number
  bmi: number | null
  body_fat_pct: number | null
  water_pct: number | null
  muscle_kg: number | null
  bone_kg: number | null
  visceral_fat: number | null
  bmr_kcal: number | null
}

/** A chart point: a day, or a week's Monday over a year. */
export type BodyPoint = { date: string; weight: number; body_fat_pct: number | null }

export type BodyOverview = {
  /** Of all time, not only this range. */
  latest: Measurement | null
  range: Range
  points: BodyPoint[]
  /** From the range's first point to its last, in kg. */
  change: number | null
  /** The range's weighings, newest first. */
  measurements: Measurement[]
  /** Whether the profile has what the body composition needs. */
  profile_complete: boolean
}

export type NewMeasurement =
  | { source: 'manual'; weight: number; day?: string; body_fat_pct?: number }
  | { source: 'scale'; weight: number; impedance?: number }

/** What the chart shows: one series at a time. */
export const METRICS = ['weight', 'body_fat'] as const
export type Metric = (typeof METRICS)[number]
