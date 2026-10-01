/** Formatting for the body screens (pure). */
import { localNow } from '@/features/home/home'
import { formatDayMonth, formatTime } from '@/lib/format'

import type { Measurement } from './types'

/** An instant's day where the user is: "28 set.". */
export function localDay(instant: string, timeZone: string, language: string): string {
  return formatDayMonth(localNow(timeZone, new Date(instant)).date, language)
}

/** When a weighing was taken: "28 set. · 18:30", or the day alone for one typed in (an earlier
 * day's is stored at noon, a time nobody chose). */
export function weighedAt(
  measurement: Pick<Measurement, 'measured_at' | 'source'>,
  timeZone: string,
  language: string,
): string {
  const day = localDay(measurement.measured_at, timeZone, language)
  return measurement.source === 'manual' ? day : `${day} · ${formatTime(measurement.measured_at, language, timeZone)}`
}
