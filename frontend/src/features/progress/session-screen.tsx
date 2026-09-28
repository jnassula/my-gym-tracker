import { WatchIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { healthQuery, shortcutUrl } from '@/features/health/api'
import { weekdayOf } from '@/features/training/plan'
import { formatWeight } from '@/features/training/weight'
import { useWorkoutLabels } from '@/features/workouts/labels'
import type { Weekday } from '@/features/workouts/types'
import { useRequiredSession } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { formatDayMonth, formatTime } from '@/lib/format'

import { sessionDetailQuery } from './api'
import { formatDuration } from './format'
import { HeartRateChart } from './heart-rate-chart'
import type { SessionDetail } from './types'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'

/** One session: duration, heart rate and calories from the Apple Watch (once synced), and each
 * exercise with its sets and heart-rate peak. */
export function SessionScreen({ sessionId }: { sessionId: string }) {
  const detail = useQuery(sessionDetailQuery(sessionId))
  if (detail.isPending || detail.isError) {
    return (
      <Page title="" back="/progress/calendar">
        {detail.isPending ? (
          <Spinner className="mx-auto size-6 text-muted-foreground" />
        ) : (
          <FormAlert messageKey={errorKey(detail.error)} />
        )}
      </Page>
    )
  }
  return <Session data={detail.data} />
}

function Session({ data }: { data: SessionDetail }) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const { user } = useRequiredSession()
  const language = i18n.language
  const { health } = data
  const lastSet = data.exercises.reduce<string | null>(
    (last, exercise) => (last && last > exercise.first_set_at ? last : exercise.first_set_at),
    null,
  )
  const start = health?.starts_at ?? data.started_at
  const end = health?.ends_at ?? data.ended_at ?? lastSet
  const time = (iso: string) => formatTime(iso, language, user.timezone)
  const kicker = [
    `${labels.weekdayLong(weekdayOf(data.date) as Weekday)} ${formatDayMonth(data.date, language)}`,
    end ? `${time(start)}–${time(end)}` : time(start),
  ].join(' · ')

  return (
    <Page
      kicker={kicker}
      title={data.label || t('health.session.untitled')}
      back="/progress/calendar"
      action={
        health && (
          <Badge variant="secondary" className="shrink-0 gap-1">
            <WatchIcon aria-hidden weight="bold" />
            {t('health.session.synced')}
          </Badge>
        )
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Tile
            label={t('health.session.duration')}
            value={formatDuration(data.duration_seconds)}
          />
          <Tile
            label={t('health.session.avgHr')}
            value={health?.avg_heart_rate ? t('health.session.bpm', { value: health.avg_heart_rate }) : '—'}
          />
          <Tile
            label={t('health.session.calories')}
            value={health?.calories ? t('health.session.kcal', { value: health.calories }) : '—'}
          />
        </div>

        {health && health.heart_rate.length > 0 ? (
          <Card className="grid gap-2 p-4">
            <div className="flex items-baseline justify-between text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
              <span>{t('health.session.heartRate')}</span>
              {health.max_heart_rate && <span>{t('health.session.max', { value: health.max_heart_rate })}</span>}
            </div>
            <HeartRateChart points={health.heart_rate} exercises={data.exercises} timeZone={user.timezone} />
          </Card>
        ) : (
          !health && <NoWatchData />
        )}

        <section className="grid gap-2">
          <h2 className={HEADING}>{health ? t('health.session.setsPeaks') : t('health.session.sets')}</h2>
          <ul className="grid gap-1.5">
            {data.exercises.map((exercise) => (
              <li
                key={exercise.exercise_id}
                className="flex min-h-11 items-center gap-3 rounded-lg bg-card px-3 text-[13px]"
              >
                <span className="min-w-0 flex-1 truncate">
                  {t('health.session.exerciseSets', { name: exercise.name, count: exercise.sets })}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {formatWeight(exercise.top_weight, user.unit, language)}
                </span>
                {exercise.peak_heart_rate !== null && (
                  <span
                    className="w-14 shrink-0 text-right text-heart tabular-nums"
                    title={t('health.session.peak', { value: exercise.peak_heart_rate })}
                  >
                    <span aria-hidden>↑ </span>
                    <span className="sr-only">{t('health.session.peak', { value: exercise.peak_heart_rate })}</span>
                    <span aria-hidden>{exercise.peak_heart_rate}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-0.5 p-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-xl tabular-nums">{value}</span>
    </Card>
  )
}

/** No samples for this session yet: sync now (connected) or connect Apple Health. */
function NoWatchData() {
  const { t } = useTranslation()
  const health = useQuery(healthQuery())
  const connected = health.data?.connected
  return (
    <Card className="grid gap-3 p-4 text-[13px]">
      <p className="text-muted-foreground">
        {connected ? t('health.session.noDataConnected') : t('health.session.noData')}
      </p>
      {connected ? (
        <a href={shortcutUrl()} className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }))}>
          {t('health.syncNow')}
        </a>
      ) : (
        <Link to="/settings/health" className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }))}>
          {t('health.connect')}
        </Link>
      )}
    </Card>
  )
}
