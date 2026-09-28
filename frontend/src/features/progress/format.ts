/** Formatting for the progress screens (pure). Weights arrive in kg; see training/weight.ts. */
import { formatNumber, toUnit, type Unit } from '@/features/training/weight'
import { intlLocale } from '@/i18n'
import { formatDayMonth } from '@/lib/format'

/** 3120 → "52 min"; 18720 → "5 h 12". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

/** A change with its sign: "+5", "−2,5" (a real minus sign), "0". */
export function formatSigned(value: number, locale: string): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value), locale)}`
}

/** A change in weight, in the user's unit: "+5 kg". */
export function formatWeightChange(kg: number, unit: Unit, locale: string): string {
  return `${formatSigned(toUnit(kg, unit), locale)} ${unit}`
}

/** "2026-09-23" → "23 set." (pt), "Sep 23" (en). */
export function formatShortDate(iso: string, locale: string): string {
  return formatDayMonth(iso, locale)
}

/** "2026-09-01" → "setembro de 2026". */
export function formatMonth(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', year: 'numeric' }).format(new Date(`${iso}T00:00:00`))
}

/** First day of the month `offset` months from `iso`'s: ("2026-09-01", -1) → "2026-08-01". */
export function shiftMonth(iso: string, offset: number): string {
  const [year, month] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + offset, 1))
  return date.toISOString().slice(0, 10)
}

/** Percentage change, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null
}
