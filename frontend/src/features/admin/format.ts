/** Formatting for the backoffice (pure). */
import { intlLocale } from '@/i18n'
import { formatDayMonth } from '@/lib/format'

import type { Change, Unit } from './types'

/** Share of a whole, rounded: (1, 4) → 25. Nothing to divide by → 0. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

/** The difference to the period before. */
export function difference(change: Change): number {
  return change.current - change.previous
}

/** 12840 → "12 840" (pt), "12,840" (en); pt-PT leaves four digits together ("1240"). */
export function formatCount(value: number, language: string): string {
  return new Intl.NumberFormat(intlLocale(language)).format(value)
}

/** A bucket on the chart's axis: "23 set." for days and weeks, "set." for months. */
export function formatBucketTick(start: string, unit: Unit, language: string): string {
  if (unit !== 'month') return formatDayMonth(start, language)
  return new Intl.DateTimeFormat(intlLocale(language), { month: 'short' }).format(new Date(`${start}T00:00:00`))
}

/** "2026-09-01" → "setembro de 2026". */
export function formatMonthYear(start: string, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), { month: 'long', year: 'numeric' }).format(
    new Date(`${start}T00:00:00`),
  )
}

/** The day an instant fell on in a time zone: "23 set. 2026". */
export function formatInstantDay(iso: string, language: string, timeZone: string): string {
  // en-CA writes dates as ISO, which is what formatDayMonth reads.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  )
  return formatDayMonth(day, language, true)
}
