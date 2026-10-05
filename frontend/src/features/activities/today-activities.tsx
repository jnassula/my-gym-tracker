import { PlusIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PlanWeek } from '@/features/training/types'

import { activitiesQuery, useSetActivityDay } from './api'
import { MarkSheet } from './mark-sheet'
import { isOn } from './rules'

const CHIP = 'flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-medium'

/**
 * Início, under the week: the user's activities as switches for today ("surf, the sea is good"),
 * and the way to the other days of the week. Today's suggestion works around what is on here.
 */
export function TodayActivities({ week }: { week: PlanWeek }) {
  const { t } = useTranslation()
  const activities = useQuery(activitiesQuery())
  const setDay = useSetActivityDay()
  const [marking, setMarking] = useState(false)

  if (!activities.data) return null
  const { activities: list } = activities.data
  if (list.length === 0) {
    // Nobody is asked about activities they don't have: one quiet way in.
    return (
      <Link
        to="/settings/activities"
        aria-label={t('activities.addFirstLabel')}
        className={cn(CHIP, 'w-fit border border-dashed text-muted-foreground')}
      >
        <PlusIcon aria-hidden className="size-4" />
        {t('activities.addFirst')}
      </Link>
    )
  }
  return (
    <section aria-labelledby="home-activities" className="grid gap-2">
      <h2 id="home-activities" className="text-[0.6875rem] font-medium tracking-widest text-primary uppercase">
        {t('activities.today')}
      </h2>
      <div className="flex flex-wrap gap-2">
        {list.map((activity) => {
          const on = isOn(week, activity.id, week.today)
          return (
            <button
              key={activity.id}
              type="button"
              aria-pressed={on}
              aria-label={t('activities.toggle', { name: activity.name })}
              disabled={setDay.isPending}
              onClick={() => setDay.mutate({ activityId: activity.id, date: week.today, on: !on })}
              className={cn(CHIP, on ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}
            >
              {activity.name}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setMarking(true)}
          className={cn(CHIP, 'border border-dashed text-muted-foreground')}
        >
          {t('activities.otherDays')}
        </button>
      </div>
      <MarkSheet activities={list} week={week} open={marking} onOpenChange={setMarking} />
    </section>
  )
}
