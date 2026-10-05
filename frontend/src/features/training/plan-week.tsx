import { CaretRightIcon, CheckIcon, DownloadSimpleIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { planQuery } from '@/features/workouts/api'
import { ExportSheet } from '@/features/workouts/export-sheet'
import { formatDate } from '@/features/workouts/format'
import { useWorkoutLabels } from '@/features/workouts/labels'

import { weekQuery } from './api'
import { useDayDate } from './day-date'
import { dayRows, inHand, type DayRow } from './plan'

/** Treinos → plan: this week's days, what's done, and the way into each day. */
export function PlanWeekScreen({ planId }: { planId: string }) {
  const { t, i18n } = useTranslation()
  const plan = useQuery(planQuery(planId))
  const week = useQuery(weekQuery(planId))
  const [exporting, setExporting] = useState(false)

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
  const { workouts_done: done, target } = week.data
  // A plan that rotates its days has no weekday to show beside each.
  const hasWeekdays = days.some((day) => day.weekday !== null)

  return (
    <Page
      kicker={t('training.week.kicker')}
      title={plan.data.name}
      back="/workouts"
      action={
        <Button
          variant="outline-primary"
          size="touch"
          className="h-11 px-3"
          aria-label={t('export.buttonLabel')}
          onClick={() => setExporting(true)}
        >
          <DownloadSimpleIcon />
          {t('export.button')}
        </Button>
      }
    >
      <ExportSheet open={exporting} plan={plan.data} onOpenChange={setExporting} />
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {plan.data.is_active && <Badge>{t('workouts.active')}</Badge>}
          {plan.data.valid_until && (
            <span>{t('workouts.validUntil', { date: formatDate(plan.data.valid_until, i18n.language) })}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Progress
            value={target ? Math.min(100, (done / target) * 100) : 0}
            aria-label={t('training.week.progress', { done, total: target })}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground tabular-nums">
            {done}/{target}
          </span>
        </div>
        {/* The plan's workouts in its order. Its weekdays are where the trainer put them, not
            when they must be done: each row says how the workout stands this week. */}
        <ul className="grid gap-2">
          {dayRows(days, week.data).map((row) => (
            <li key={row.day.id}>
              <DayLink
                planId={planId}
                row={row}
                showWeekday={hasWeekdays}
                inHand={inHand(week.data) && week.data.suggestion.day_id === row.day.id}
              />
            </li>
          ))}
        </ul>
      </div>
    </Page>
  )
}

type DayLinkProps = { planId: string; row: DayRow; showWeekday: boolean; inHand: boolean }

function DayLink({ planId, row, showWeekday, inHand: highlighted }: DayLinkProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const dayDate = useDayDate()
  const { day, state } = row
  const total = day.exercises.length
  const detail =
    state === 'today'
      ? t('training.week.today', { done: row.done, total })
      : state === 'trained' && row.date
        ? t('training.week.doneOn', { count: total, when: dayDate(row.date) })
        : t('training.week.exercises', { count: total })

  return (
    <Link
      to="/workouts/$planId/days/$dayId"
      params={{ planId, dayId: day.id }}
      className={cn(
        'flex min-h-16 items-center gap-3 rounded-2xl bg-card px-3 py-2',
        highlighted && 'bg-accent ring-1 ring-primary',
      )}
    >
      {showWeekday && (
        <span className="w-10 shrink-0 text-center text-[0.6875rem] font-medium text-muted-foreground uppercase">
          {day.weekday === null ? '—' : labels.weekdayShort(day.weekday)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">
          {day.label || labels.weekdayLong(day.weekday)}
        </span>
        <span className={cn('block text-xs text-muted-foreground', highlighted && 'text-primary')}>{detail}</span>
      </span>
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-primary',
          row.trained && 'bg-primary text-primary-foreground',
        )}
      >
        {row.trained ? (
          <CheckIcon weight="bold" className="size-4" aria-label={t('training.week.doneLabel')} />
        ) : highlighted ? (
          <CaretRightIcon
            className="size-4"
            aria-label={state === 'today' ? t('training.week.todayLabel') : t('training.week.suggestedLabel')}
          />
        ) : null}
      </span>
    </Link>
  )
}
