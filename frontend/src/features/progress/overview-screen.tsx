import { ChartLineUpIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/app-shell/empty-state'
import { Page } from '@/components/app-shell/page'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { BodyCard } from '@/features/body/body-card'
import { FormAlert } from '@/features/auth/form-parts'
import { formatWeight, toUnit } from '@/features/training/weight'
import { useWorkoutLabels } from '@/features/workouts/labels'
import { useRequiredSession } from '@/lib/auth'

import { overviewQuery } from './api'
import { formatSigned } from './format'
import { OverviewStats } from './overview-stats'
import { Sparkline } from './sparkline'
import type { ExerciseTrend, ProgressOverview } from './types'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'

/** Progresso: streak, this week's volume and records, sets by group, and each exercise's trend. */
export function OverviewScreen() {
  const { t } = useTranslation()
  const overview = useQuery(overviewQuery())
  return (
    <Page title={t('nav.progress')}>
      {overview.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : overview.isError ? (
        <FormAlert messageKey={errorKey(overview.error)} />
      ) : overview.data.exercises.length === 0 && overview.data.week_streak === 0 ? (
        <div className="grid gap-4">
          <EmptyState
            icon={ChartLineUpIcon}
            title={t('empty.progress.title')}
            description={t('empty.progress.description')}
          />
          <Link to="/" className={cn(buttonVariants({ variant: 'outline-primary', size: 'hero' }))}>
            {t('progress.startTraining')}
          </Link>
          {/* The body weight doesn't wait for a first workout. */}
          <BodyCard />
        </div>
      ) : (
        <Overview data={overview.data} />
      )}
    </Page>
  )
}

function Overview({ data }: { data: ProgressOverview }) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const maxSets = Math.max(1, ...data.sets_by_group.map((group) => group.sets))

  return (
    <div className="grid gap-6">
      <OverviewStats data={data} />
      <BodyCard />

      <section className="grid gap-2" aria-labelledby="by-group">
        <div className="grid gap-0.5">
          <h2 id="by-group" className={HEADING}>
            {t('progress.byGroup')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('progress.byGroupHint')}</p>
        </div>
        {data.sets_by_group.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('progress.byGroupEmpty')}</p>
        ) : (
          <ul className="grid gap-1.5">
            {data.sets_by_group.map(({ muscle_group, sets }) => (
              <li key={muscle_group ?? 'none'} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-3 text-[13px]">
                <span className="truncate">{labels.group(muscle_group)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  {/* The biggest group in the accent, the rest a step back (emphasis). */}
                  <span
                    className={cn('block h-full rounded-full', sets === maxSets ? 'bg-primary' : 'bg-primary/45')}
                    style={{ width: `${(sets / maxSets) * 100}%` }}
                  />
                </span>
                <span className="text-right text-muted-foreground tabular-nums">{sets}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2" aria-labelledby="by-exercise">
        <h2 id="by-exercise" className={HEADING}>
          {t('progress.byExercise')}
        </h2>
        <ul className="grid gap-2">
          {data.exercises.map((exercise) => (
            <li key={exercise.exercise_id}>
              <ExerciseRow exercise={exercise} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function ExerciseRow({ exercise }: { exercise: ExerciseTrend }) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const { user } = useRequiredSession()
  const trend = formatSigned(toUnit(exercise.trend, user.unit), i18n.language)
  return (
    <Link
      to="/progress/exercises/$exerciseId"
      params={{ exerciseId: exercise.exercise_id }}
      className="flex min-h-14 items-center gap-3 rounded-xl bg-card px-3 py-2.5"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{exercise.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {t('progress.exerciseRow', {
            group: labels.group(exercise.muscle_group),
            weight: formatWeight(exercise.best_weight, user.unit, i18n.language),
          })}
        </span>
      </span>
      <Sparkline
        values={exercise.recent.map((point) => point.weight)}
        width={60}
        height={24}
        className="text-primary"
      />
      <span
        aria-label={t('progress.trend', { trend })}
        className={cn(
          'w-14 shrink-0 text-right text-sm font-medium tabular-nums',
          exercise.trend > 0 ? 'text-primary' : exercise.trend < 0 ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {trend}
      </span>
    </Link>
  )
}
