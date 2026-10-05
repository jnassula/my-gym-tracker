import { CalendarCheckIcon, CaretRightIcon, CheckIcon, StarIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/app-shell/empty-state'
import { Button, buttonVariants } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { overviewQuery } from '@/features/progress/api'
import { OverviewStats } from '@/features/progress/overview-stats'
import type { LastRecord, ProgressOverview } from '@/features/progress/types'
import { UserAvatar } from '@/features/settings/user-avatar'
import { dayLogQuery, weekQuery } from '@/features/training/api'
import { addDays, dayProgress, weekdayOf } from '@/features/training/plan'
import type { PlanWeek } from '@/features/training/types'
import { useMarkDayDone } from '@/features/training/use-mark-day-done'
import { formatWeight } from '@/features/training/weight'
import { planQuery, plansQuery } from '@/features/workouts/api'
import { useWorkoutLabels } from '@/features/workouts/labels'
import type { Day, Plan, Weekday } from '@/features/workouts/types'
import { useRequiredSession } from '@/lib/auth'
import { formatDayMonth, formatDayMonthLong } from '@/lib/format'

import { firstName, greetingFor, localNow, nextToDo, weekStrip, type StripCell } from './home'
import { SwitchSheet } from './switch-sheet'

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

/** The reasons this app has words for; a newer server's others simply aren't said. */
const REASONS = {
  plan: 'home.reason.plan',
  catch_up: 'home.reason.catch_up',
  next: 'home.reason.next',
} as const

/**
 * Today's workout as the server suggests it (`week.suggestion`): one to carry on, the one done,
 * the one to start, or a quiet card when nothing is due or the week is complete. Whichever it
 * is, "Trocar" opens the plan's other workouts: the user decides on the day.
 */
function TodayCard({ plan, week }: { plan: Plan; week: PlanWeek }) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const [choosing, setChoosing] = useState(false)
  const { kind, day_id: dayId } = week.suggestion
  const day = plan.days.find((item) => item.id === dayId) ?? null
  const sheet = <SwitchSheet plan={plan} week={week} open={choosing} onOpenChange={setChoosing} />

  if (day && (kind === 'continue' || kind === 'done' || kind === 'suggest')) {
    return (
      <>
        <TrainCard plan={plan} day={day} week={week} onSwitch={() => setChoosing(true)} />
        {sheet}
      </>
    )
  }
  const complete = kind === 'complete'
  const description = complete
    ? t('home.complete.description', { done: week.workouts_done, target: week.target })
    : day
      ? t('home.rest.next', {
          label: day.label || labels.weekdayLong(day.weekday),
          weekday: labels.weekdayLong(day.weekday),
        })
      : t('home.rest.nothing')
  return (
    <section aria-labelledby="home-today" className={TODAY_CARD}>
      <h2 id="home-today" className={HEADING}>
        {t('home.today')}
      </h2>
      <p className="text-xl font-medium">{complete ? t('home.complete.title') : t('home.rest.title')}</p>
      <p className="text-[13px] text-muted-foreground">{description}</p>
      <Button variant="outline-primary" size="touch" onClick={() => setChoosing(true)}>
        {complete ? t('home.another') : t('home.choose')}
      </Button>
      {sheet}
    </section>
  )
}

type TrainCardProps = { plan: Plan; day: Day; week: PlanWeek; onSwitch: () => void }

function TrainCard({ plan, day, week, onSwitch }: TrainCardProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const log = useQuery(dayLogQuery(day.id))
  const mark = useMarkDayDone(day.id)
  const session = log.data?.session ?? null
  const { done, total } = dayProgress(day, session)
  const { kind, reason } = week.suggestion
  const finished = kind === 'done' || (total > 0 && done === total)
  const next = nextToDo(day, session)
  const title = day.label || labels.weekdayLong(day.weekday)
  const why = kind === 'suggest' && reason !== null && reason in REASONS ? REASONS[reason as keyof typeof REASONS] : null
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
      <p className="text-xl font-medium">{title}</p>
      {(log.isError || mark.isError) && <FormAlert messageKey={errorKey(log.error ?? mark.error)} />}
      {log.data && (
        <>
          <Progress value={total ? (done / total) * 100 : 0} aria-label={t('training.progress', { done, total })} />
          <p className="truncate text-[13px] text-muted-foreground">
            {finished || !next
              ? t('home.allDone')
              : !session && why
                ? t(why)
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
      {finished ? (
        <Button variant="outline" size="touch" onClick={onSwitch}>
          {t('home.another')}
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="touch" aria-label={t('home.switchLabel')} onClick={onSwitch}>
            {t('home.switch')}
          </Button>
          <Button
            variant="outline"
            size="touch"
            aria-label={t('home.doneItLabel', { name: title })}
            disabled={mark.isPending}
            onClick={() => mark.mutate()}
          >
            {t('home.doneIt')}
          </Button>
        </div>
      )}
    </section>
  )
}

function ThisWeek({ plan, week }: { plan: Plan; week: PlanWeek }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="home-week" className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="home-week" className={HEADING}>
          {t('home.week')}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t('home.weekCount', { done: week.workouts_done, target: week.target })}
        </span>
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {weekStrip(plan.days, week).map((cell) => (
          <li key={cell.date}>
            <WeekCell cell={cell} planId={plan.id} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function WeekCell({ cell, planId }: { cell: StripCell; planId: string }) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const trained = cell.state === 'trained'
  const label = [
    labels.weekdayLong(cell.weekday),
    trained ? t('home.dayState.done') : cell.state === 'planned' ? t('home.dayState.planned') : t('home.dayState.idle'),
    cell.day?.label,
    cell.isToday ? t('home.dayState.today') : null,
  ]
    .filter(Boolean)
    .join(', ')
  const className = cn(
    'flex h-11 items-center justify-center rounded-lg bg-card text-[13px] font-medium',
    trained && 'bg-primary text-primary-foreground',
    cell.state === 'idle' && 'bg-card/50 text-muted-foreground',
    cell.isToday && 'ring-1 ring-primary ring-inset',
  )
  const mark = trained ? (
    <CheckIcon aria-hidden weight="bold" className="size-4" />
  ) : (
    <span aria-hidden>{t(`weekdays.initial.${cell.weekday}`)}</span>
  )
  const current = cell.isToday ? 'date' : undefined

  // Today's workout opens where it is carried on; an earlier day's opens what was done.
  if (cell.isToday && cell.day) {
    return (
      <Link
        to="/workouts/$planId/days/$dayId"
        params={{ planId, dayId: cell.day.id }}
        search={{ from: 'home' }}
        aria-label={label}
        aria-current={current}
        className={className}
      >
        {mark}
      </Link>
    )
  }
  if (cell.sessionId) {
    return (
      <Link
        to="/progress/sessions/$sessionId"
        params={{ sessionId: cell.sessionId }}
        aria-label={label}
        aria-current={current}
        className={className}
      >
        {mark}
      </Link>
    )
  }
  return (
    <span className={className} aria-current={current}>
      {mark}
      <span className="sr-only">{label}</span>
    </span>
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
