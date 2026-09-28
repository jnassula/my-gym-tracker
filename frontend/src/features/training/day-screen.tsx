import { CheckIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { groupByMuscle } from '@/features/workouts/format'
import { useWorkoutLabels } from '@/features/workouts/labels'
import type { Exercise, Plan } from '@/features/workouts/types'
import { useRequiredSession } from '@/lib/auth'

import { dayLogQuery, useFinishSession, useToggleDone } from './api'
import { dayProgress, isDone, isTicked, plannedSets, setsOf, topWeight } from './plan'
import { RestPill, RestSheet } from './rest-timer-ui'
import { SummaryDialog } from './summary-dialog'
import type { PastSession, SessionSummary, TrainingSession } from './types'
import { formatWeight } from './weight'

type DayScreenProps = {
  plan: Plan
  dayId: string
  isToday: boolean
  /** Opened from Início: its exercises keep the way back there, and finishing returns there. */
  fromHome?: boolean
  backLink?: ReactNode
}

/** A plan day: its exercises by muscle group, what's done today, and "Terminar treino". */
export function DayScreen({ plan, dayId, isToday, fromHome = false, backLink }: DayScreenProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const navigate = useNavigate()
  const { user } = useRequiredSession()
  const log = useQuery(dayLogQuery(dayId))
  const toggle = useToggleDone(dayId)
  const finish = useFinishSession(dayId)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const day = plan.days.find((item) => item.id === dayId)

  if (!day) {
    return (
      <Page title={plan.name} backLink={backLink}>
        <FormAlert messageKey="training.dayNotFound" />
      </Page>
    )
  }

  const weekday = labels.weekdayLong(day.weekday)
  const title = day.label || weekday
  const kicker = isToday ? t('training.todayKicker', { weekday }) : weekday
  const session = log.data?.session ?? null
  const { done, total } = dayProgress(day, session)

  return (
    <Page kicker={kicker} title={title} backLink={backLink} action={<RestPill />}>
      {log.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : log.isError ? (
        <FormAlert messageKey={errorKey(log.error)} />
      ) : (
        <div className="grid gap-5">
          <div className="flex items-center gap-3">
            <Progress
              value={total ? (done / total) * 100 : 0}
              aria-label={t('training.progress', { done, total })}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground tabular-nums">
              {done}/{total}
            </span>
          </div>
          {groupByMuscle(day.exercises).map(({ group, exercises }) => (
            <section key={group ?? 'none'} className="grid gap-2">
              <h2 className="text-[0.6875rem] font-medium tracking-widest text-primary uppercase">
                {labels.group(group)}
              </h2>
              <ul className="grid gap-2">
                {exercises.map((exercise) => (
                  <li key={exercise.id}>
                    <ExerciseRow
                      exercise={exercise}
                      planId={plan.id}
                      dayId={dayId}
                      session={session}
                      last={log.data.last[exercise.id]}
                      fromHome={fromHome}
                      busy={toggle.isPending}
                      onToggle={(ticked) => toggle.mutate({ exerciseId: exercise.id, done: ticked })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {(toggle.error ?? finish.error) && (
            <FormAlert messageKey={errorKey(toggle.error ?? finish.error)} />
          )}
          <Button
            variant="outline-primary"
            size="hero"
            disabled={!session || finish.isPending}
            onClick={() => session && finish.mutate(session.id, { onSuccess: setSummary })}
          >
            {finish.isPending ? t('training.finishing') : t('training.finish')}
          </Button>
        </div>
      )}
      <RestSheet next={null} />
      <SummaryDialog
        summary={summary}
        title={title}
        unit={user.unit}
        onClose={() => {
          setSummary(null)
          void navigate(fromHome ? { to: '/' } : { to: '/workouts/$planId', params: { planId: plan.id } })
        }}
      />
    </Page>
  )
}

type ExerciseRowProps = {
  exercise: Exercise
  planId: string
  dayId: string
  session: TrainingSession | null
  last: PastSession | undefined
  fromHome: boolean
  busy: boolean
  onToggle: (ticked: boolean) => void
}

function ExerciseRow({ exercise, planId, dayId, session, last, fromHome, busy, onToggle }: ExerciseRowProps) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const { user } = useRequiredSession()
  const logged = setsOf(session, exercise.id).length
  const planned = plannedSets(exercise)
  const done = isDone(exercise, session)
  const ticked = isTicked(exercise, session)
  const lastWeight = topWeight(last)
  const detail = [
    labels.scheme(exercise),
    lastWeight === null ? null : lastWeight === 0 ? t('training.noLoad') : formatWeight(lastWeight, user.unit, i18n.language),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex min-h-15 items-center rounded-xl bg-card pr-3">
      {/* Done by its sets can't be unticked here; delete a set on the exercise screen instead. */}
      <button
        type="button"
        aria-pressed={done}
        aria-label={done ? t('training.unmarkDone', { name: exercise.name }) : t('training.markDone', { name: exercise.name })}
        disabled={busy || (done && !ticked)}
        onClick={() => onToggle(!ticked)}
        className="flex size-12 shrink-0 items-center justify-center rounded-xl disabled:cursor-default"
      >
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-full border-2 border-muted-foreground/50',
            done && 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {done && <CheckIcon weight="bold" className="size-4" />}
        </span>
      </button>
      <Link
        to="/workouts/$planId/days/$dayId/$exerciseId"
        params={{ planId, dayId, exerciseId: exercise.id }}
        search={{ from: fromHome ? 'home' : undefined }}
        className="flex min-w-0 flex-1 items-center gap-3 py-2"
      >
        <span className="min-w-0 flex-1">
          {/* Up to two lines: similar names ("Elevação Frontal com…") must stay distinguishable. */}
          <span className={cn('line-clamp-2 text-[15px] font-medium wrap-anywhere', done && 'opacity-60')}>
            {exercise.name}
          </span>
          {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end text-[0.6875rem] text-muted-foreground">
          <span
            className={cn(
              'text-sm tabular-nums',
              done ? 'text-primary' : logged > 0 ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {Math.min(logged, planned)}/{planned}
          </span>
          {t('training.sets')}
        </span>
      </Link>
    </div>
  )
}
