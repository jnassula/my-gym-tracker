/** Formatting for the body screens (pure). */
import { localNow } from '@/features/home/home'
import { formatDayMonth, formatTime } from '@/lib/format'

/** An instant's day where the user is: "28 set.". */
export function localDay(instant: string, timeZone: string, language: string): string {
  return formatDayMonth(localNow(timeZone, new Date(instant)).date, language)
}

/** When a weighing was taken: "28 set. · 18:30" for the scale's, the day alone for one typed
 * in (an earlier day's is stored at noon, a time nobody chose). */
export function weighedAt(
  measurement: { measured_at: string; source: 'manual' | 'scale' },
  timeZone: string,
  language: string,
): string {
  const day = localDay(measurement.measured_at, timeZone, language)
  return measurement.source === 'scale' ? `${day} · ${formatTime(measurement.measured_at, language, timeZone)}` : day
}
