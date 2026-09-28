import { CaretRightIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Toggle } from '@/components/ui/toggle'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { Sparkline } from '@/features/progress/sparkline'
import { formatRest } from '@/features/workouts/format'
import { useWorkoutLabels } from '@/features/workouts/labels'
import type { Day, Exercise, Plan } from '@/features/workouts/types'
import { useRequiredSession } from '@/lib/auth'
import { formatDayMonth } from '@/lib/format'

import { dayLogQuery, historyQuery, useLogSet } from './api'
import { LogSetSheet } from './log-set-sheet'
import { PlateSheet } from './plate-sheet'
import { nextExercise, plannedSets, restSeconds, setsOf, suggestion, topWeight } from './plan'
import { restTimer } from './rest-timer'
import { RestPill, RestSheet } from './rest-timer-ui'
import { SetDialog } from './set-dialog'
import type { DayLog, ExerciseHistory, LoggedSet, PastSet } from './types'
import {
  clampWeight,
  formatNumber,
  formatWeight,
  parseWeight,
  QUICK_STEPS,
  toKg,
  toUnit,
  type Unit,
} from './weight'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'

type ExerciseScreenProps = { plan: Plan; dayId: string; exerciseId: string; backLink: ReactNode }

/** One exercise mid-workout: pick the weight, log sets, rest, see last time. */
export function ExerciseScreen({ plan, dayId, exerciseId, backLink }: ExerciseScreenProps) {
  const labels = useWorkoutLabels()
  const log = useQuery(dayLogQuery(dayId))
  const day = plan.days.find((item) => item.id === dayId)
  const exercise = day?.exercises.find((item) => item.id === exerciseId)

  if (!day || !exercise) {
    return (
      <Page title={plan.name} backLink={backLink}>
        <FormAlert messageKey="training.exercise.notFound" />
      </Page>
    )
  }
  return (
    <Page
      kicker={labels.group(exercise.muscle_group)}
      title={exercise.name}
      backLink={backLink}
      action={<RestPill />}
    >
      {log.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : log.isError ? (
        <FormAlert messageKey={errorKey(log.error)} />
      ) : (
        // Keyed: another exercise starts from its own suggestion.
        <ExerciseLogger key={exercise.id} day={day} exercise={exercise} log={log.data} />
      )}
    </Page>
  )
}

function ExerciseLogger({ day, exercise, log }: { day: Day; exercise: Exercise; log: DayLog }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const labels = useWorkoutLabels()
  const { user } = useRequiredSession()
  const unit = user.unit
  const inputId = useId()
  const history = useQuery(historyQuery(exercise.id))
  const logSet = useLogSet(day.id)

  const today = setsOf(log.session, exercise.id)
  const last = log.last[exercise.id]
  const lastTop = topWeight(last)
  const lastInUnit = lastTop === null ? null : toUnit(lastTop, unit)
  const next = suggestion(exercise, today.length, today, last)
  const planned = plannedSets(exercise)
  const scheme = labels.scheme(exercise)
  const rest = formatRest(exercise.rest_seconds, exercise.rest_max_seconds)

  // The weight on screen, in the user's unit, and the text in the big input.
  const [weight, setWeight] = useState(() => toUnit(next.weightKg, unit))
  const [text, setText] = useState(() => formatNumber(weight, locale))
  const [decreasing, setDecreasing] = useState(false)
  const [logging, setLogging] = useState(false)
  const [editing, setEditing] = useState<LoggedSet | null>(null)
  const [afterRest, setAfterRest] = useState<string | null>(null)
  const [platesOpen, setPlatesOpen] = useState(false)

  function changeWeight(value: number) {
    const clamped = clampWeight(value, unit)
    setWeight(clamped)
    setText(formatNumber(clamped, locale))
  }

  function typeWeight(value: string) {
    setText(value)
    const parsed = parseWeight(value)
    if (parsed !== null) setWeight(clampWeight(parsed, unit))
  }

  function confirm(setWeightValue: number, reps: number) {
    logSet.mutate(
      { exerciseId: exercise.id, weight: toKg(setWeightValue, unit), reps },
      {
        onSuccess: (session) => {
          setLogging(false)
          changeWeight(setWeightValue)
          const count = setsOf(session, exercise.id).length
          const following = nextExercise(day, exercise.id)
          setAfterRest(
            count >= planned && following
              ? t('training.rest.next', { name: following.name })
              : t('training.rest.nextSet', { name: exercise.name, n: count + 1 }),
          )
          // "Descanso automático" (Definições) decides whether logging starts the rest.
          if (user.auto_rest) restTimer.start(restSeconds(exercise))
        },
      },
    )
  }

  const delta = lastInUnit === null ? null : Math.round((weight - lastInUnit) * 100) / 100
  const best = Math.max(history.data?.best_weight ?? 0, ...today.map((set) => set.weight))

  return (
    <div className="grid gap-5 pb-24">
      <ul className="flex flex-wrap gap-2 text-xs">
        {scheme && <li className="rounded-lg bg-card px-2.5 py-1.5">{scheme}</li>}
        {rest && <li className="rounded-lg bg-card px-2.5 py-1.5">{t('training.exercise.rest', { time: rest })}</li>}
        <li className="rounded-lg bg-card px-2.5 py-1.5">
          {lastTop === null
            ? t('training.exercise.lastNone')
            : t('training.exercise.last', {
                weight: lastTop === 0 ? t('training.noLoad') : formatWeight(lastTop, unit, locale),
              })}
        </li>
      </ul>

      <section className="grid justify-items-center gap-1">
        <label htmlFor={inputId} className="text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
          {t('training.exercise.currentWeight')}
        </label>
        <div className="flex items-baseline gap-2">
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            size={Math.max(2, text.length)}
            value={text}
            aria-label={t('training.exercise.weightInput', { unit })}
            onChange={(event) => typeWeight(event.target.value)}
            onFocus={(event) => event.target.select()}
            onBlur={() => setText(formatNumber(weight, locale))}
            className="rounded-lg bg-transparent text-right text-7xl font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-2xl text-muted-foreground">{unit}</span>
        </div>
        {delta !== null && (
          <p
            className={cn(
              'text-sm',
              delta > 0 ? 'text-primary' : delta < 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {delta === 0
              ? t('training.exercise.same')
              : t(delta > 0 ? 'training.exercise.heavier' : 'training.exercise.lighter', {
                  delta: `${formatNumber(Math.abs(delta), locale)} ${unit}`,
                })}
          </p>
        )}
      </section>

      <div className="grid gap-2">
        <div className="grid grid-cols-5 gap-2">
          {QUICK_STEPS.map((step) => (
            <Button
              key={step}
              variant="outline-primary"
              size="touch"
              className="px-0 tabular-nums"
              onClick={() => changeWeight(weight + (decreasing ? -step : step))}
            >
              {decreasing ? '−' : '+'}
              {step}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Toggle
            variant="outline"
            pressed={decreasing}
            onPressedChange={setDecreasing}
            className="h-11 rounded-xl aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {decreasing ? t('training.exercise.decreasing') : t('training.exercise.decrease')}
          </Toggle>
          <Button
            variant="outline"
            size="touch"
            className="h-11"
            disabled={lastInUnit === null}
            onClick={() => lastInUnit !== null && changeWeight(lastInUnit)}
          >
            {t('training.exercise.useLast')}
          </Button>
          <Button variant="outline" size="touch" className="h-11" onClick={() => setPlatesOpen(true)}>
            {t('training.plates.open')}
          </Button>
        </div>
      </div>

      <section className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className={HEADING}>{t('training.exercise.setsToday')}</h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {Math.min(today.length, planned)}/{planned}
          </span>
        </div>
        {today.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('training.exercise.noSets')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {today.map((set) => (
              <li key={set.id}>
                <button
                  type="button"
                  aria-label={t('training.exercise.setChip', {
                    n: set.set_number,
                    weight: formatWeight(set.weight, unit, locale),
                    reps: set.reps,
                  })}
                  onClick={() => setEditing(set)}
                  className="flex h-11 items-center gap-2 rounded-lg border bg-card px-3 text-sm"
                >
                  <span className="text-muted-foreground">#{set.set_number}</span>
                  <span className="font-semibold tabular-nums">
                    {formatNumber(toUnit(set.weight, unit), locale)}
                  </span>
                  <span className="text-muted-foreground">×</span>
                  <span className="tabular-nums">{set.reps}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <HistoryCard history={history.data} pending={history.isPending} best={best} unit={unit} />
      <ProgressionCard exerciseId={exercise.id} history={history.data} best={best} unit={unit} />

      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 bg-linear-to-t from-background from-60% to-transparent px-5 pt-6 pb-3">
        <div className="mx-auto max-w-md">
          <Button
            size="hero"
            className="w-full shadow-lg"
            onClick={() => {
              logSet.reset()
              setLogging(true)
            }}
          >
            {t('training.exercise.logSet', { weight: `${formatNumber(weight, locale)} ${unit}`, reps: next.reps })}
          </Button>
        </div>
      </div>

      <LogSetSheet
        open={logging}
        onOpenChange={setLogging}
        number={today.length + 1}
        scheme={scheme}
        unit={unit}
        weight={weight}
        reps={next.reps}
        pending={logSet.isPending}
        errorKey={logSet.error ? errorKey(logSet.error) : null}
        onConfirm={confirm}
      />
      <SetDialog dayId={day.id} set={editing} unit={unit} onClose={() => setEditing(null)} />
      <PlateSheet open={platesOpen} onOpenChange={setPlatesOpen} weight={weight} unit={unit} />
      <RestSheet next={afterRest} />
    </div>
  )
}

function formatSets(sets: PastSet[], unit: Unit, locale: string): string {
  return sets.map((set) => `${formatNumber(toUnit(set.weight, unit), locale)} × ${set.reps}`).join(' · ')
}

type HistoryCardProps = {
  history: ExerciseHistory | undefined
  pending: boolean
  /** Heaviest weight ever, today included (kg). */
  best: number
  unit: Unit
}

function HistoryCard({ history, pending, best, unit }: HistoryCardProps) {
  const { t, i18n } = useTranslation()
  return (
    <Card className="gap-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={HEADING}>{t('training.exercise.history')}</h2>
        {best > 0 && (
          <span className="text-xs text-primary">
            {t('training.exercise.record', { weight: formatWeight(best, unit, i18n.language) })}
          </span>
        )}
      </div>
      {pending ? (
        <Spinner className="size-5 text-muted-foreground" />
      ) : !history?.sessions.length ? (
        <p className="text-sm text-muted-foreground">{t('training.exercise.noHistory')}</p>
      ) : (
        <ul className="grid gap-1.5">
          {history.sessions.map((session, index) => (
            <li key={`${session.date}-${index}`} className="flex gap-3 text-sm">
              <span className="w-14 shrink-0 text-muted-foreground">
                {formatDayMonth(session.date, i18n.language)}
              </span>
              <span className="tabular-nums">{formatSets(session.sets, unit, i18n.language)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

type ProgressionCardProps = {
  exerciseId: string
  history: ExerciseHistory | undefined
  /** Heaviest weight ever, today included (kg). */
  best: number
  unit: Unit
}

/** "Progressão": the last sessions' heaviest sets at a glance; opens the full progress. */
function ProgressionCard({ exerciseId, history, best, unit }: ProgressionCardProps) {
  const { t, i18n } = useTranslation()
  const points = history?.recent ?? []
  return (
    <Link
      to="/progress/exercises/$exerciseId"
      params={{ exerciseId }}
      className="grid gap-2 rounded-xl bg-card px-4 py-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={HEADING}>{t('progress.card.title')}</h2>
        <span className="flex items-center gap-1 text-xs text-primary">
          {t('progress.card.open')}
          <CaretRightIcon aria-hidden className="size-3" />
        </span>
      </div>
      {points.length < 2 ? (
        <p className="text-sm text-muted-foreground">{t('progress.card.empty')}</p>
      ) : (
        <>
          <Sparkline
            values={points.map((point) => point.weight)}
            width={320}
            height={56}
            endDot
            className="h-14 w-full text-primary"
          />
          <div className="flex justify-between gap-3 text-[0.6875rem] text-muted-foreground">
            <span>
              {t('progress.card.sessions', {
                count: points.length,
                min: formatWeight(Math.min(...points.map((point) => point.weight)), unit, i18n.language),
              })}
            </span>
            {best > 0 && (
              <span className="text-primary">
                {t('progress.card.record', { weight: formatWeight(best, unit, i18n.language) })}
              </span>
            )}
          </div>
        </>
      )}
    </Link>
  )
}
