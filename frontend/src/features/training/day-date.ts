import { useTranslation } from 'react-i18next'

import { useWorkoutLabels } from '@/features/workouts/labels'
import type { Weekday } from '@/features/workouts/types'
import { intlLocale } from '@/i18n'
import { formatDayMonth } from '@/lib/format'

import { weekdayOf } from './plan'

/** A date of this week as a sentence says it: "seg, 28 set." ("Mon, 28 Sept" in English). */
export function useDayDate() {
  const { i18n } = useTranslation()
  const labels = useWorkoutLabels()
  return (isoDate: string) => {
    const weekday = labels.weekdayShort(weekdayOf(isoDate) as Weekday)
    // The labels are written for headings ("Seg"); inside a sentence only English keeps the capital.
    const said = i18n.language === 'en' ? weekday : weekday.toLocaleLowerCase(intlLocale(i18n.language))
    return `${said}, ${formatDayMonth(isoDate, i18n.language)}`
  }
}
