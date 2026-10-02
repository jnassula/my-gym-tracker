import { CalendarCheckIcon, CaretRightIcon, CheckIcon, StarIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/app-shell/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { overviewQuery } from '@/features/progress/api'
import { OverviewStats } from '@/features/progress/overview-stats'
import type { LastRecord, ProgressOverview } from '@/features/progress/types'
import { UserAvatar } from '@/features/settings/user-avatar'
import { dayLogQuery, weekQuery } from '@/features/training/api'
import { addDays, dayProgress, isDayDone, weekdayOf } from '@/features/training/plan'
import type { PlanWeek } from '@/features/training/types'
import { formatWeight } from '@/features/training/weight'
import { planQuery, plansQuery } from '@/features/workouts/api'
import { useWorkoutLabels } from '@/features/workouts/labels'
import type { Day, Plan, Weekday } from '@/features/workouts/types'
import { useRequiredSession } from '@/lib/auth'
import { formatDayMonth, formatDayMonthLong } from '@/lib/format'

import { firstName, greetingFor, localNow, nextToDo, todayPlan, weekStrip, type StripDay } from './home'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'
const TODAY_CARD = 'grid gap-3 rounded-2xl bg-linear-to-b from-accent to-card p-4 ring-1 ring-primary/60'

/** Início: a greeting, today's workout, this week, the headline numbers and the latest record. */
export function HomeScreen() {
  const { t } = useTranslation()
  const plans = useQuery(plansQuery())
  const overview = useQuery(overviewQuery())
  const active = plans.data?.find((plan) => plan.is_active)

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-6">
      <Greeting />
      <div className="grid gap-4 pt-4">
        {plans.isPending || overview.isPending ? (
          <Spinner className="mx-auto size-6 text-muted-foreground" />
        ) : plans.isError || overview.isError ? (
          <FormAlert messageKey={errorKey(plans.error ?? overview.error)} />
        ) : active ? (
          <ActivePlan planId={active.id} overview={overview.data} />
        ) : (
          <>
            <EmptyState
              icon={CalendarCheckIcon}
              title={t('empty.today.title')}
              description={t('empty.today.description')}
            />
            <Link to="/workouts/import" className={cn(buttonVariants({ size: 'hero' }))}>
              {t('workouts.importCta')}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function Greeting() {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const { user } = useRequiredSession()
  const [now] = useState(() => new Date())
  const { date, hour } = localNow(user.timezone, now)

  return (
    <header className="flex min-h-14 items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-muted-foreground">
          {t('home.date', {
            weekday: labels.weekdayLong(weekdayOf(date) as Weekday),
            date: formatDayMonthLong(date, i18n.language),
          })}
        </p>
        <h1 className="truncate text-2xl">{t(`home.greeting.${greetingFor(hour)}`, { name: firstName(user.name) })}</h1>
      </div>
      <Link to="/settings/profile" aria-label={t('home.profile')} className="shrink-0 rounded-full">
        <UserAvatar user={user} className="size-11" fallbackClassName="text-lg" />
      </Link>
    </header>
  )
}

function ActivePlan({ planId, overview }: { planId: string; overview: ProgressOverview }) {
  const plan = useQuery(planQuery(planId))
  const week = useQuery(weekQuery(planId))

  if (plan.isPending || week.isPending) return <Spinner className="mx-auto size-6 text-muted-foreground" />
  if (plan.isError || week.isError) return <FormAlert messageKey={errorKey(plan.error ?? week.error)} />
  return (
    <>
      <TodayCard plan={plan.data} week={week.data} />
      <ThisWeek plan={plan.data} week={week.data} />
      <OverviewStats data={overview} />
      {overview.last_record && <LastRecordCard record={overview.last_record} today={week.data.today} />}
      <PlanLink plan={plan.data} />
    </>
  )
}

function TodayCard({ plan, week }: { plan: Plan; week: PlanWeek }) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const today = todayPlan(plan.days, weekdayOf(week.today))
  if (today.kind === 'train') return <TrainCard plan={plan} day={today.day} week={week} />

  const description =
    today.kind === 'choose'
      ? t('training.restToday.chooseDescription')
      : today.next.label
        ? t('training.restToday.next', { weekday: labels.weekdayLong(today.next.weekday), label: today.next.label })
        : t('training.restToday.nextNoLabel', { weekday: labels.weekdayLong(today.next.weekday) })

  return (
    <section aria-labelledby="home-today" className={TODAY_CARD}>
      <h2 id="home-today" className={HEADING}>
        {t('home.today')}
      </h2>
      <p className="text-xl font-medium">
        {today.kind === 'choose' ? t('training.restToday.chooseTitle') : t('training.restToday.title')}
      </p>
      <p className="text-[13px] text-muted-foreground">{description}</p>
      <Link
        to="/workouts/$planId"
        params={{ planId: plan.id }}
        className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }))}
      >
        {t('training.restToday.seeWeek')}
      </Link>
    </section>
  )
}

function TrainCard({ plan, day, week }: { plan: Plan; day: Day; week: PlanWeek }) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const log = useQuery(dayLogQuery(day.id))
  const session = log.data?.session ?? null
  const { done, total } = dayProgress(day, session)
  const status = week.days.find((item) => item.day_id === day.id)
  const finished = isDayDone(status) || (total > 0 && done === total)
  const next = nextToDo(day, session)
  // One hero per screen: starting or carrying on today's workout; once done, a quiet way back in.
  const action = finished ? 'review' : session ? 'continue' : 'start'

  return (
    <section aria-labelledby="home-today" className={TODAY_CARD}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-today" className={HEADING}>
          {t('home.today')}
        </h2>
        {log.data && (
          <span className="text-xs text-muted-foreground tabular-nums">{t('home.exercises', { done, total })}</span>
        )}
      </div>
      <p className="text-xl font-medium">{day.label || labels.weekdayLong(day.weekday)}</p>
      {log.isError && <FormAlert messageKey={errorKey(log.error)} />}
      {log.data && (
        <>
          <Progress value={total ? (done / total) * 100 : 0} aria-label={t('training.progress', { done, total })} />
          <p className="truncate text-[13px] text-muted-foreground">
            {finished || !next
              ? t('home.allDone')
              : t('home.next', { exercise: [next.name, labels.scheme(next)].filter(Boolean).join(' · ') })}
          </p>
        </>
      )}
      <Link
        to="/workouts/$planId/days/$dayId"
        params={{ planId: plan.id, dayId: day.id }}
        search={{ from: 'home' }}
        className={cn(buttonVariants({ variant: finished ? 'outline-primary' : 'default', size: 'hero' }), 'mt-1')}
      >
        {t(`home.${action}`)}
        <CaretRightIcon aria-hidden className="size-4" />
      </Link>
    </section>
  )
}

function ThisWeek({ plan, week }: { plan: Plan; week: PlanWeek }) {
  const { t } = useTranslation()
  const status = new Map(week.days.map((item) => [item.day_id, item]))
  const done = plan.days.filter((day) => isDayDone(status.get(day.id))).length
  // Plans that rotate days (A/B/C) have no weekdays to lay out.
  const hasWeekdays = plan.days.some((day) => day.weekday !== null)

  return (
    <section aria-labelledby="home-week" className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="home-week" className={HEADING}>
          {t('home.week')}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t('training.week.progress', { done, total: plan.days.length })}
        </span>
      </div>
      {hasWeekdays && (
        <ol className="grid grid-cols-7 gap-1.5">
          {weekStrip(plan.days, week).map((cell) => (
            <li key={cell.weekday}>
              <WeekCell cell={cell} planId={plan.id} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function WeekCell({ cell, planId }: { cell: StripDay; planId: string }) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const label = [
    labels.weekdayLong(cell.weekday),
    cell.state === 'planned' ? cell.day?.label : t(`home.dayState.${cell.state}`),
    cell.isToday ? t('home.dayState.today') : null,
  ]
    .filter(Boolean)
    .join(', ')
  const className = cn(
    'flex h-11 items-center justify-center rounded-lg bg-card text-[13px] font-medium',
    cell.state === 'done' && 'bg-primary text-primary-foreground',
    cell.state === 'missed' && 'text-muted-foreground',
    cell.state === 'rest' && 'bg-card/50 text-muted-foreground',
    cell.isToday && 'ring-1 ring-primary ring-inset',
  )
  const mark =
    cell.state === 'done' ? (
      <CheckIcon aria-hidden weight="bold" className="size-4" />
    ) : (
      <span aria-hidden>{cell.state === 'rest' ? '·' : t(`weekdays.initial.${cell.weekday}`)}</span>
    )

  if (!cell.day) {
    return (
      <span className={className}>
        {mark}
        <span className="sr-only">{label}</span>
      </span>
    )
  }
  return (
    <Link
      to="/workouts/$planId/days/$dayId"
      params={{ planId, dayId: cell.day.id }}
      search={{ from: 'home' }}
      aria-label={label}
      aria-current={cell.isToday ? 'date' : undefined}
      className={className}
    >
      {mark}
    </Link>
  )
}

function LastRecordCard({ record, today }: { record: LastRecord; today: string }) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const { user } = useRequiredSession()
  // A record from the last seven days says its weekday; an older one its date.
  const when =
    record.date >= addDays(today, -6)
      ? labels.weekdayShort(weekdayOf(record.date) as Weekday)
      : formatDayMonth(record.date, i18n.language)

  return (
    <Link
      to="/progress/exercises/$exerciseId"
      params={{ exerciseId: record.exercise_id }}
      className="flex min-h-15 items-center gap-3 rounded-xl bg-card px-3 py-2.5"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
        <StarIcon aria-hidden weight="fill" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{t('home.lastRecord')}</span>
        <span className="block truncate text-[15px] font-medium">
          {[record.name, formatWeight(record.weight, user.unit, i18n.language), when].join(' · ')}
        </span>
      </span>
    </Link>
  )
}

function PlanLink({ plan }: { plan: Plan }) {
  const { t, i18n } = useTranslation()
  return (
    <Link
      to="/workouts/$planId"
      params={{ planId: plan.id }}
      className="flex min-h-12 items-center gap-2 rounded-xl border px-3 text-[13px] text-muted-foreground"
    >
      <span className="min-w-0 flex-1 truncate">
        {plan.valid_until
          ? t('home.planUntil', { name: plan.name, date: formatDayMonth(plan.valid_until, i18n.language) })
          : t('home.plan', { name: plan.name })}
      </span>
      <CaretRightIcon aria-hidden className="size-4 shrink-0 text-primary" />
    </Link>
  )
}
