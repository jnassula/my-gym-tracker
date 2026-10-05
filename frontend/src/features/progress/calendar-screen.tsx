import { CaretLeftIcon, CaretRightIcon, CheckIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { weekdayOf } from '@/features/training/plan'
import { useWorkoutLabels } from '@/features/workouts/labels'
import { WEEKDAYS, type Weekday } from '@/features/workouts/types'
import { intlLocale } from '@/i18n'

import { calendarQuery } from './api'
import { formatDuration, formatMonth, shiftMonth } from './format'
import type { DayStatus, ProgressCalendar, WeekSession } from './types'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'

/**
 * Status is categorical, not an intensity scale: trained is filled, every other day outlined,
 * every cell carries its day number and a spoken label, and the legend names the two states.
 * "missed" is only what a server from before the flexible week may still send: no date is missed
 * now (the plan's weekdays are a suggestion), so it isn't in the legend.
 */
const CELL: Record<DayStatus, string> = {
  trained: 'bg-primary text-primary-foreground',
  missed: 'bg-border text-foreground',
  rest: 'border border-border/70 text-muted-foreground',
  today: 'border border-border/70 text-foreground',
  future: 'border border-dashed border-border text-muted-foreground',
}

/** The mark of another activity on a day, in whatever colour the cell's text has. */
const DOT = 'absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current opacity-70'

type CalendarScreenProps = {
  /** First day of the month shown; empty for the current month. */
  month: string
  onMonthChange: (month: string) => void
}

/** Consistência: did I show up? A month of trained, missed and rest days, and this week. */
export function CalendarScreen({ month, onMonthChange }: CalendarScreenProps) {
  const { t } = useTranslation()
  const calendar = useQuery(calendarQuery(month))
  return (
    <Page title={t('progress.calendar.title')} back="/progress">
      {calendar.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : calendar.isError ? (
        <FormAlert messageKey={errorKey(calendar.error)} />
      ) : (
        <div className={cn('grid gap-5 transition-opacity', calendar.isPlaceholderData && 'opacity-60')}>
          <Stats data={calendar.data} />
          <Month data={calendar.data} onMonthChange={onMonthChange} />
          <ThisWeek sessions={calendar.data.this_week} today={calendar.data.today} />
        </div>
      )}
    </Page>
  )
}

function Stats({ data }: { data: ProgressCalendar }) {
  const { t } = useTranslation()
  const stats = [
    { value: String(data.week_streak), label: t('progress.calendar.streak') },
    { value: String(data.sessions_total), label: t('progress.calendar.total') },
    {
      value: data.adherence_30d === null ? '—' : `${Math.round(data.adherence_30d * 100)}%`,
      label: t('progress.calendar.adherence'),
    },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((stat) => (
        <div key={stat.label} className="grid gap-1 rounded-xl bg-card p-3">
          <span className="text-2xl font-medium">{stat.value}</span>
          <span className="text-[0.6875rem] text-muted-foreground">{stat.label}</span>
        </div>
      ))}
    </div>
  )
}

function Month({ data, onMonthChange }: { data: ProgressCalendar; onMonthChange: (month: string) => void }) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const locale = i18n.language
  const current = `${data.today.slice(0, 7)}-01`
  const blanks = weekdayOf(data.month)
  const dayLabel = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long' })

  return (
    <Card className="gap-3 px-3 py-3">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon-touch"
          className="text-primary"
          aria-label={t('progress.calendar.previous')}
          onClick={() => onMonthChange(shiftMonth(data.month, -1))}
        >
          <CaretLeftIcon />
        </Button>
        <h2 className="text-base first-letter:uppercase">{formatMonth(data.month, locale)}</h2>
        <Button
          variant="ghost"
          size="icon-touch"
          className="text-primary"
          aria-label={t('progress.calendar.next')}
          disabled={data.month >= current}
          onClick={() => onMonthChange(shiftMonth(data.month, 1))}
        >
          <CaretRightIcon />
        </Button>
      </div>
      <div aria-hidden className="grid grid-cols-7 gap-1.5 text-center text-[0.625rem] text-muted-foreground">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{labels.weekdayShort(weekday)}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: blanks }, (_, index) => (
          <li key={`blank-${index}`} aria-hidden />
        ))}
        {data.days.map(({ date, status, activities = [] }) => (
          <li
            key={date}
            aria-label={[
              `${dayLabel.format(new Date(`${date}T00:00:00`))}: ${t(`progress.calendar.status.${status}`)}`,
              ...activities,
            ].join(', ')}
            className={cn(
              'relative flex aspect-square items-center justify-center rounded-lg text-xs tabular-nums',
              CELL[status],
              date === data.today && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
            )}
          >
            <span aria-hidden>{Number(date.slice(8))}</span>
            {/* Another activity that day: a mark of its own, since the day may be trained too. */}
            {activities.length > 0 && <span aria-hidden className={DOT} />}
          </li>
        ))}
      </ol>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-muted-foreground">
        {(['trained', 'rest'] as const).map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-3 rounded', CELL[status])} />
            {t(`progress.calendar.status.${status}`)}
          </li>
        ))}
        {data.days.some((day) => day.activities?.length) && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className={cn('relative size-3 rounded', CELL.rest)}>
              <span className={cn(DOT, 'bottom-0.5')} />
            </span>
            {t('progress.calendar.activity')}
          </li>
        )}
      </ul>
    </Card>
  )
}

function ThisWeek({ sessions, today }: { sessions: WeekSession[]; today: string }) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  return (
    <section className="grid gap-2" aria-labelledby="this-week">
      <h2 id="this-week" className={HEADING}>
        {t('progress.calendar.thisWeek')}
      </h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('progress.calendar.noSessions')}</p>
      ) : (
        <ul className="grid gap-2">
          {sessions.map((session) => {
            const isToday = session.date === today
            const complete = session.exercises_total > 0 && session.exercises_done === session.exercises_total
            const title = [labels.weekdayShort(session.weekday as Weekday), session.label].filter(Boolean).join(' · ')
            return (
              <li key={session.session_id}>
                <Link
                  to="/progress/sessions/$sessionId"
                  params={{ sessionId: session.session_id }}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-xl bg-card px-3 py-2 text-[13px]',
                    isToday && 'bg-accent ring-1 ring-primary',
                  )}
                >
                {complete ? (
                  <CheckIcon weight="bold" className="size-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <CaretRightIcon className="size-4 shrink-0 text-primary" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{title}</span>
                <span className={cn('shrink-0 text-muted-foreground tabular-nums', isToday && 'text-primary')}>
                  {isToday && !complete
                    ? t('progress.calendar.today', { done: session.exercises_done, total: session.exercises_total })
                    : complete && session.sets === 0 && session.duration_seconds === 0
                      ? t('progress.calendar.markedDone')
                      : t('progress.calendar.session', {
                          duration: formatDuration(session.duration_seconds),
                          sets: session.sets,
                        })}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
