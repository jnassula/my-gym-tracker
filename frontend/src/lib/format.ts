import { intlLocale } from '@/i18n'

/** "2026-09-23" → "23 set." (pt), "23 Sept" (en), "23 sept" (es); with the year: "23 set. 2026". */
export function formatDayMonth(iso: string, language: string, withYear = false): string {
  const date = new Date(`${iso}T00:00:00`)
  const month = new Intl.DateTimeFormat(intlLocale(language), { month: 'short' }).format(date)
  return [date.getDate(), month, withYear ? date.getFullYear() : null].filter(Boolean).join(' ')
}

/** "2026-09-30" → "30 de setembro" (pt), "30 September" (en), "30 de septiembre" (es). */
export function formatDayMonthLong(iso: string, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), { day: 'numeric', month: 'long' }).format(
    new Date(`${iso}T00:00:00`),
  )
}

/** An instant's wall-clock time in a time zone: "18:02". */
export function formatTime(iso: string, language: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), { hour: 'numeric', minute: '2-digit', timeZone }).format(
    new Date(iso),
  )
}
