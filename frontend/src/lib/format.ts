import { intlLocale } from '@/i18n'

/** "2026-09-23" → "23 set." (pt), "23 Sept" (en), "23 sept" (es); with the year: "23 set. 2026". */
export function formatDayMonth(iso: string, language: string, withYear = false): string {
  const date = new Date(`${iso}T00:00:00`)
  const month = new Intl.DateTimeFormat(intlLocale(language), { month: 'short' }).format(date)
  return [date.getDate(), month, withYear ? date.getFullYear() : null].filter(Boolean).join(' ')
}
