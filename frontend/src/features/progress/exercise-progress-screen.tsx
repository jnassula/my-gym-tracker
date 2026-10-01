import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { formatNumber, formatVolume, formatWeight, toUnit } from '@/features/training/weight'
import { useWorkoutLabels } from '@/features/workouts/labels'
import { useRequiredSession } from '@/lib/auth'

import { exerciseProgressQuery } from './api'
import { formatShortDate, formatWeightChange } from './format'
import { RangePicker } from './range-picker'
import { TrendChart } from './trend-chart'
import type { ExerciseProgress, Range } from './types'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'

type ExerciseProgressScreenProps = {
  exerciseId: string
  range: Range
  onRangeChange: (range: Range) => void
}

/** One exercise over time: heaviest set per session (per week over a year), PR, volume, trend. */
export function ExerciseProgressScreen({ exerciseId, range, onRangeChange }: ExerciseProgressScreenProps) {
  const labels = useWorkoutLabels()
  const progress = useQuery(exerciseProgressQuery(exerciseId, range))

  if (progress.isPending || progress.isError) {
    return (
      <Page title="" back="/progress">
        {progress.isPending ? (
          <Spinner className="mx-auto size-6 text-muted-foreground" />
        ) : (
          <FormAlert messageKey={errorKey(progress.error)} />
        )}
      </Page>
    )
  }
  const { data } = progress
  return (
    <Page kicker={labels.group(data.muscle_group)} title={data.name} back="/progress">
      {/* While another range loads, the previous one stays, dimmed (no layout jump). */}
      <div className={cn('grid gap-4 transition-opacity', progress.isPlaceholderData && 'opacity-60')}>
        <RangePicker range={range} onChange={onRangeChange} />
        <Details data={data} />
      </div>
    </Page>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-card p-3">
      <span className="text-[0.6875rem] text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-lg font-medium',
          tone === 'up' && 'text-primary',
          tone === 'down' && 'text-destructive',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Details({ data }: { data: ExerciseProgress }) {
  const { t, i18n } = useTranslation()
  const { user } = useRequiredSession()
  const unit = user.unit
  const locale = i18n.language
  const weekly = data.range === '1y'

  return (
    <>
      <Card className="gap-3 px-4 py-4">
        <h2 className={HEADING}>
          {weekly ? t('progress.detail.chartTitleWeekly') : t('progress.detail.chartTitle')}
        </h2>
        {data.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('progress.detail.empty')}</p>
        ) : (
          <TrendChart
            points={data.points.map((point) => ({ date: point.date, value: toUnit(point.weight, unit) }))}
            label={t('progress.detail.heaviest')}
            unit={unit}
          />
        )}
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Tile
          label={t('progress.detail.pr')}
          value={data.best_weight === null ? '—' : formatWeight(data.best_weight, unit, locale)}
        />
        <Tile label={t('progress.detail.volume')} value={formatVolume(data.volume, unit, locale)} />
        <Tile
          label={t('progress.detail.trend')}
          value={data.trend === null ? '—' : formatWeightChange(data.trend, unit, locale)}
          tone={data.trend === null || data.trend === 0 ? undefined : data.trend > 0 ? 'up' : 'down'}
        />
      </div>

      {data.sessions.length > 0 && (
        <table className="w-full text-[13px]">
          <caption className="sr-only">{t('progress.detail.sessions')}</caption>
          <thead>
            <tr className="text-left text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
              <th scope="col" className="px-1 pb-2 font-medium">
                {t('progress.detail.date')}
              </th>
              <th scope="col" className="px-1 pb-2 text-right font-medium">
                {t('progress.detail.best')}
              </th>
              <th scope="col" className="px-1 pb-2 text-right font-medium">
                {t('progress.detail.sessionVolume')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((session, index) => (
              <tr key={`${session.date}-${index}`} className="border-t">
                <td className="px-1 py-2.5">{formatShortDate(session.date, locale)}</td>
                <td className="px-1 py-2.5 text-right tabular-nums">
                  {formatNumber(toUnit(session.weight, unit), locale)} × {session.reps}
                </td>
                <td className="px-1 py-2.5 text-right text-muted-foreground tabular-nums">
                  {formatWeight(session.volume, unit, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
