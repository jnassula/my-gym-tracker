/**
 * Weights are stored in kg; lb users see and type pounds. Steps (+5 … +25, ±2.5) are in the
 * unit on screen: "+5" on a lb screen adds 5 lb.
 */

export type Unit = 'kg' | 'lb'

const LB_PER_KG = 2.2046226218
/** The API refuses more than 1000 kg. */
const MAX_KG = 1000

export const QUICK_STEPS = [5, 10, 15, 20, 25] as const
export const FINE_STEP = 2.5

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** kg → the unit on screen (lb to 0.1, so 135 lb typed comes back as 135). */
export function toUnit(kg: number, unit: Unit): number {
  return unit === 'kg' ? round(kg, 2) : round(kg * LB_PER_KG, 1)
}

/** The unit on screen → kg with the 2 decimals the API stores. */
export function toKg(value: number, unit: Unit): number {
  return unit === 'kg' ? round(value, 2) : round(value / LB_PER_KG, 2)
}

/** Keeps a weight on screen within 0 and the API's maximum. */
export function clampWeight(value: number, unit: Unit): number {
  return Math.min(Math.max(round(value, 2), 0), toUnit(MAX_KG, unit))
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
}

/** 57.5 kg → "57,5 kg" (pt), "126.8 lb" for a lb user. */
export function formatWeight(kg: number, unit: Unit, locale: string): string {
  return `${formatNumber(toUnit(kg, unit), locale)} ${unit}`
}

/** Session volume: tonnes from 1000 kg ("9,8 t"), as in the design; lb users get lb. */
export function formatVolume(kg: number, unit: Unit, locale: string): string {
  if (unit === 'lb') return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(toUnit(kg, 'lb'))} lb`
  if (kg >= 1000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(kg / 1000)} t`
  return `${formatNumber(kg, locale)} kg`
}

/** "57,5", "57.5", " 60 " → a number; anything else → null. Accepts the PT decimal comma. */
export function parseWeight(text: string): number | null {
  const normalized = text.trim().replace(',', '.')
  return /^\d{1,4}(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : null
}
