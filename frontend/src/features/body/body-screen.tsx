import { ScalesIcon, TrashIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/app-shell/empty-state'
import { Page } from '@/components/app-shell/page'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { formatSigned, formatWeightChange } from '@/features/progress/format'
import { RangePicker } from '@/features/progress/range-picker'
import { TrendChart } from '@/features/progress/trend-chart'
import type { Range } from '@/features/progress/types'
import { Segmented } from '@/features/settings/rows'
import { formatNumber, formatWeight, toUnit, type Unit } from '@/features/training/weight'
import { useRequiredSession } from '@/lib/auth'

import { AddMeasurementDialog } from './add-measurement-dialog'
import { bodyQuery, useDeleteMeasurement } from './api'
import { Figures } from './figures'
import { weighedAt } from './format'
import { scaleSupport } from './scale'
import { METRICS, type BodyOverview, type Measurement, type Metric } from './types'
import { WeighSheet } from './weigh-sheet'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'

type BodyScreenProps = {
  range: Range
  metric: Metric
  onRangeChange: (range: Range) => void
  onMetricChange: (metric: Metric) => void
}

/** Body weight over time: the latest weighing with its composition, the chart, and every
 * weighing of the range. Weighings come from the scale ("Pesar agora") or are typed in. */
export function BodyScreen({ range, metric, onRangeChange, onMetricChange }: BodyScreenProps) {
  const { t } = useTranslation()
  const { user } = useRequiredSession()
  const body = useQuery(bodyQuery(range))
  const [adding, setAdding] = useState<'scale' | 'manual' | null>(null)
  // Without Web Bluetooth (any browser on an iPhone, Firefox…) typing it in is the way.
  const support = scaleSupport()

  const actions = (
    <div className="grid gap-2">
      {support === 'supported' ? (
        <>
          <Button size="hero" onClick={() => setAdding('scale')}>
            {t('body.weighNow')}
          </Button>
          <Button variant="outline-primary" size="touch" onClick={() => setAdding('manual')}>
            {t('body.addManual')}
          </Button>
        </>
      ) : (
        <>
          <Button size="hero" onClick={() => setAdding('manual')}>
            {t('body.addManual')}
          </Button>
          <p className="px-1 text-xs text-muted-foreground">{t(`body.scale.support.${support}`)}</p>
        </>
      )}
    </div>
  )

  return (
    <Page title={t('body.title')} back="/progress">
      {body.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : body.isError ? (
        <FormAlert messageKey={errorKey(body.error)} />
      ) : body.data.latest === null ? (
        <div className="grid gap-4">
          <EmptyState icon={ScalesIcon} title={t('body.empty.title')} description={t('body.empty.description')} />
          {actions}
        </div>
      ) : (
        // While another range loads, the previous one stays, dimmed (no layout jump).
        <div className={cn('grid gap-4 transition-opacity', body.isPlaceholderData && 'opacity-60')}>
          <Latest measurement={body.data.latest} profileComplete={body.data.profile_complete} unit={user.unit} />
          {actions}
          <RangePicker range={range} onChange={onRangeChange} />
          <Trend data={body.data} metric={metric} unit={user.unit} onMetricChange={onMetricChange} />
          <Measurements measurements={body.data.measurements} unit={user.unit} />
        </div>
      )}
      <WeighSheet open={adding === 'scale'} onOpenChange={(open) => !open && setAdding(null)} unit={user.unit} />
      <AddMeasurementDialog
        open={adding === 'manual'}
        unit={user.unit}
        timeZone={user.timezone}
        onClose={() => setAdding(null)}
      />
    </Page>
  )
}

type LatestProps = { measurement: Measurement; profileComplete: boolean; unit: Unit }

function Latest({ measurement, profileComplete, unit }: LatestProps) {
  const { t, i18n } = useTranslation()
  const { user } = useRequiredSession()
  const estimated = measurement.source === 'scale' && measurement.body_fat_pct !== null
  return (
    <Card className="gap-3 px-4 py-4">
      <h2 className={HEADING}>{t('body.latest')}</h2>
      <div className="grid gap-0.5">
        <p className="text-4xl font-medium tabular-nums">{formatWeight(measurement.weight, unit, i18n.language)}</p>
        <p className="text-[13px] text-muted-foreground">
          {weighedAt(measurement, user.timezone, i18n.language)} · {t(`body.source.${measurement.source}`)}
        </p>
      </div>
      <Figures measurement={measurement} unit={unit} />
      {estimated && <p className="text-xs text-muted-foreground">{t('body.estimate')}</p>}
      {measurement.source === 'scale' && !profileComplete && (
        <p className="text-[13px] text-muted-foreground">
          {t('body.profileNeeded')}{' '}
          <Link to="/settings/profile" className="text-primary underline-offset-4 hover:underline">
            {t('body.profileLink')}
          </Link>
        </p>
      )}
    </Card>
  )
}

type TrendProps = { data: BodyOverview; metric: Metric; unit: Unit; onMetricChange: (metric: Metric) => void }

/** The chart: one series at a time, weight or (when any weighing has it) body fat. */
function Trend({ data, metric, unit, onMetricChange }: TrendProps) {
  const { t, i18n } = useTranslation()
  const weekly = data.range === '1y'
  const hasFat = data.points.some((point) => point.body_fat_pct !== null)
  const shown: Metric = hasFat ? metric : 'weight'
  const points =
    shown === 'weight'
      ? data.points.map((point) => ({ date: point.date, value: toUnit(point.weight, unit) }))
      : data.points.flatMap((point) =>
          point.body_fat_pct === null ? [] : [{ date: point.date, value: point.body_fat_pct }],
        )
  // The change of what the chart shows: kg from the server, the body fat's from its points.
  const change =
    shown === 'weight'
      ? data.change === null
        ? null
        : formatWeightChange(data.change, unit, i18n.language)
      : points.length > 1
        ? t('body.percent', { value: formatSigned(points[points.length - 1].value - points[0].value, i18n.language) })
        : null
  const title = {
    weight: weekly ? t('body.chart.weightWeekly') : t('body.chart.weight'),
    body_fat: weekly ? t('body.chart.body_fatWeekly') : t('body.chart.body_fat'),
  }[shown]

  return (
    <>
      <Card className="gap-3 px-4 py-4">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <h2 className={HEADING}>{title}</h2>
          {hasFat && (
            <Segmented
              label={t('body.metricLabel')}
              value={shown}
              options={METRICS.map((item) => ({ value: item, label: t(`body.metric.${item}`) }))}
              onChange={onMetricChange}
            />
          )}
        </div>
        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('body.chart.empty')}</p>
        ) : (
          <TrendChart points={points} label={t(`body.metric.${shown}`)} unit={shown === 'weight' ? unit : '%'} />
        )}
      </Card>
      <div className="grid gap-0.5 rounded-xl bg-card p-3">
        <span className="text-[0.6875rem] text-muted-foreground">{t('body.change')}</span>
        <span className="text-lg font-medium tabular-nums">{change ?? '—'}</span>
      </div>
    </>
  )
}

/** The range's weighings, newest first: the chart's table twin, and where one is deleted. */
function Measurements({ measurements, unit }: { measurements: Measurement[]; unit: Unit }) {
  const { t, i18n } = useTranslation()
  const { user } = useRequiredSession()
  const remove = useDeleteMeasurement()
  const [deleting, setDeleting] = useState<Measurement | null>(null)
  if (measurements.length === 0) return null
  const when = (measurement: Measurement) => weighedAt(measurement, user.timezone, i18n.language)

  return (
    <>
      <table className="w-full text-[13px]">
        <caption className={cn(HEADING, 'pb-2 text-left')}>{t('body.list.title')}</caption>
        <thead>
          <tr className="text-left text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
            <th scope="col" className="px-1 pb-2 font-medium">
              {t('body.list.date')}
            </th>
            <th scope="col" className="px-1 pb-2 text-right font-medium">
              {t('body.list.weight')}
            </th>
            <th scope="col" className="px-1 pb-2 text-right font-medium">
              {t('body.list.fat')}
            </th>
            <td />
          </tr>
        </thead>
        <tbody>
          {measurements.map((measurement) => (
            <tr key={measurement.id} className="border-t">
              <th scope="row" className="px-1 py-1 text-left font-normal">
                {when(measurement)}
              </th>
              <td className="px-1 py-1 text-right tabular-nums">
                {formatWeight(measurement.weight, unit, i18n.language)}
              </td>
              <td className="px-1 py-1 text-right text-muted-foreground tabular-nums">
                {measurement.body_fat_pct === null
                  ? '—'
                  : t('body.percent', { value: formatNumber(measurement.body_fat_pct, i18n.language) })}
              </td>
              <td className="w-11 py-1 text-right">
                <Button
                  variant="ghost"
                  size="icon-touch"
                  aria-label={t('body.list.delete', { date: when(measurement) })}
                  onClick={() => setDeleting(measurement)}
                >
                  <TrashIcon className="text-muted-foreground" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('body.list.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting &&
                t('body.list.deleteBody', {
                  weight: formatWeight(deleting.weight, unit, i18n.language),
                  date: when(deleting),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="grid grid-cols-2 gap-2">
            <AlertDialogCancel variant="outline" size="touch">
              {t('body.list.cancel')}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              size="touch"
              onClick={() => {
                if (deleting)
                  remove.mutate(deleting.id, {
                    onSuccess: () => toast.success(t('body.list.deleted')),
                    onError: (error) => toast.error(t(errorKey(error))),
                  })
                setDeleting(null)
              }}
            >
              {t('body.list.deleteConfirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
