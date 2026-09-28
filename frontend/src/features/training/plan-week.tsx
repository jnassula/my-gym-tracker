import { CaretRightIcon, CheckIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { planQuery } from '@/features/workouts/api'
import { formatDate } from '@/features/workouts/format'
import { useWorkoutLabels } from '@/features/workouts/labels'
import { WEEKDAYS, type Day, type Weekday } from '@/features/workouts/types'

import { weekQuery } from './api'
import { addDays, isDayDone, weekdayOf } from './plan'
import type { DayWeek } from './types'

/** Treinos → plan: this week's days, what's done, and the way into each day. */
export function PlanWeekScreen({ planId }: { planId: string }) {
  const { t, i18n } = useTranslation()
  const plan = useQuery(planQuery(planId))
  const week = useQuery(weekQuery(planId))

  if (plan.isPending || week.isPending) {
    return (
      <Page title="" back="/workouts">
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      </Page>
    )
  }
  if (plan.isError || week.isError) {
    return (
      <Page title="" back="/workouts">
        <FormAlert messageKey={errorKey(plan.error ?? week.error)} />
      </Page>
    )
  }

  const { days } = plan.data
  const status = new Map(week.data.days.map((item) => [item.day_id, item]))
  const byWeekday = new Map(days.filter((day) => day.weekday !== null).map((day) => [day.weekday, day]))
  const unscheduled = days.filter((day) => day.weekday === null)
  const today = weekdayOf(week.data.today)
  const doneDays = days.filter((day) => isDayDone(status.get(day.id))).length

  return (
    <Page kicker={t('training.week.kicker')} title={plan.data.name} back="/workouts">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {plan.data.is_active && <Badge>{t('workouts.active')}</Badge>}
          {plan.data.valid_until && (
            <span>{t('workouts.validUntil', { date: formatDate(plan.data.valid_until, i18n.language) })}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Progress
            value={days.length ? (doneDays / days.length) * 100 : 0}
            aria-label={t('training.week.progress', { done: doneDays, total: days.length })}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground tabular-nums">
            {doneDays}/{days.length}
          </span>
        </div>
        <ul className="grid gap-2">
          {WEEKDAYS.map((weekday) => {
            const day = byWeekday.get(weekday)
            const date = addDays(week.data.week_start, weekday)
            return (
              <li key={weekday}>
                {day ? (
                  <DayRow
                    planId={planId}
                    day={day}
                    status={status.get(day.id)}
                    date={date}
                    isToday={weekday === today}
                  />
                ) : (
                  <RestRow weekday={weekday} date={date} />
                )}
              </li>
            )
          })}
          {unscheduled.map((day) => (
            <li key={day.id}>
              <DayRow planId={planId} day={day} status={status.get(day.id)} date={null} isToday={false} />
            </li>
          ))}
        </ul>
      </div>
    </Page>
  )
}

function DateColumn({ weekday, date }: { weekday: Weekday | null; date: string | null }) {
  const labels = useWorkoutLabels()
  return (
    <span className="flex w-10 shrink-0 flex-col items-center">
      <span className="text-[0.6875rem] font-medium text-muted-foreground uppercase">
        {labels.weekdayShort(weekday)}
      </span>
      {date && <span className="text-lg tabular-nums">{Number(date.slice(8))}</span>}
    </span>
  )
}

type DayRowProps = {
  planId: string
  day: Day
  status: DayWeek | undefined
  date: string | null
  isToday: boolean
}

function DayRow({ planId, day, status, date, isToday }: DayRowProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const done = isDayDone(status)
  const total = day.exercises.length
  const doneCount = status?.exercises_done ?? 0
  const detail = done
    ? t('training.week.done', { count: total })
    : isToday
      ? t('training.week.today', { done: doneCount, total })
      : status?.session_id
        ? t('training.week.partial', { done: doneCount, total })
        : t('training.week.exercises', { count: total })

  return (
    <Link
      to="/workouts/$planId/days/$dayId"
      params={{ planId, dayId: day.id }}
      className={cn(
        'flex min-h-16 items-center gap-3 rounded-2xl bg-card px-3 py-2',
        isToday && 'bg-accent ring-1 ring-primary',
      )}
    >
      <DateColumn weekday={day.weekday} date={date} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">
          {day.label || labels.weekdayLong(day.weekday)}
        </span>
        <span className={cn('block text-xs text-muted-foreground', isToday && 'text-primary')}>{detail}</span>
      </span>
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-primary',
          done && 'bg-primary text-primary-foreground',
        )}
      >
        {done ? (
          <CheckIcon weight="bold" className="size-4" aria-label={t('training.week.doneLabel')} />
        ) : isToday ? (
          <CaretRightIcon className="size-4" aria-label={t('training.week.todayLabel')} />
        ) : null}
      </span>
    </Link>
  )
}

function RestRow({ weekday, date }: { weekday: Weekday; date: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-2xl bg-card px-3 py-2 opacity-50">
      <DateColumn weekday={weekday} date={date} />
      <span className="text-sm text-muted-foreground">{t('training.week.restDay')}</span>
    </div>
  )
}
