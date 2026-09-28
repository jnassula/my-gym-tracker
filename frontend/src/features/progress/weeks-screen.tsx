import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { Page } from '@/components/app-shell/page'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { formatNumber, formatVolume, toUnit, type Unit } from '@/features/training/weight'
import { useWorkoutLabels } from '@/features/workouts/labels'
import type { Weekday } from '@/features/workouts/types'
import { intlLocale } from '@/i18n'
import { useRequiredSession } from '@/lib/auth'

import { weeksQuery } from './api'
import { formatDuration, formatSigned, percentChange } from './format'
import type { Totals, WeekComparison } from './types'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'

type Tone = 'up' | 'down' | 'same'
const TONE: Record<Tone, string> = {
  up: 'text-primary',
  down: 'text-destructive',
  same: 'text-muted-foreground',
}
const toneOf = (difference: number): Tone => (difference > 0 ? 'up' : difference < 0 ? 'down' : 'same')

/** Comparação semanal: this week so far against last week up to the same weekday. */
export function WeeksScreen() {
  const { t } = useTranslation()
  const weeks = useQuery(weeksQuery())
  if (weeks.isPending || weeks.isError) {
    return (
      <Page title={t('progress.weeks.title')} back="/progress">
        {weeks.isPending ? (
          <Spinner className="mx-auto size-6 text-muted-foreground" />
        ) : (
          <FormAlert messageKey={errorKey(weeks.error)} />
        )}
      </Page>
    )
  }
  const { data } = weeks
  return (
    <Page
      kicker={t('progress.weeks.kicker', { week: data.iso_week, last: data.last_iso_week })}
      title={t('progress.weeks.title')}
      back="/progress"
    >
      <div className="grid gap-5">
        <Summary data={data} />
        <VolumeByDay data={data} />
        <TodayTable data={data} />
      </div>
    </Page>
  )
}

function Summary({ data }: { data: WeekComparison }) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const { user } = useRequiredSession()
  const locale = i18n.language
  const now: Totals = data.this_week
  const before: Totals = data.last_week

  const volumeDiff = now.volume - before.volume
  const percent = percentChange(now.volume, before.volume)
  const setsDiff = now.sets - before.sets
  const timeDiff = now.duration_seconds - before.duration_seconds
  const sign = (difference: number) => (difference > 0 ? '+' : difference < 0 ? '−' : '')

  const tiles = [
    {
      label: t('progress.weeks.volume'),
      value: formatVolume(now.volume, user.unit, locale),
      delta:
        volumeDiff === 0
          ? '='
          : `${sign(volumeDiff)}${formatVolume(Math.abs(volumeDiff), user.unit, locale)}${percent === null ? '' : ` · ${formatSigned(percent, locale)}%`}`,
      tone: toneOf(volumeDiff),
    },
    {
      label: t('progress.weeks.sets'),
      value: String(now.sets),
      delta: setsDiff === 0 ? '=' : formatSigned(setsDiff, locale),
      tone: toneOf(setsDiff),
    },
    {
      label: t('progress.weeks.time'),
      value: formatDuration(now.duration_seconds),
      delta: timeDiff === 0 ? '=' : `${sign(timeDiff)}${formatDuration(Math.abs(timeDiff))}`,
      tone: toneOf(timeDiff),
    },
  ]

  return (
    <section className="grid gap-2">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="grid gap-0.5 rounded-xl bg-card p-3">
            <span className="text-[0.6875rem] text-muted-foreground">{tile.label}</span>
            <span className="text-lg font-medium">{tile.value}</span>
            <span className={cn('text-xs', TONE[tile.tone])}>{tile.delta}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('progress.weeks.until', { weekday: labels.weekdayLong(data.until_weekday as Weekday) })}
      </p>
    </section>
  )
}

/** Two series of one hue: last week a step back, this week in the accent (validated pairs). */
function VolumeByDay({ data }: { data: WeekComparison }) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const { user } = useRequiredSession()
  const [showTable, setShowTable] = useState(false)
  const locale = i18n.language
  const unit: Unit = user.unit
  const compact = new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 })

  const config = {
    last: {
      label: t('progress.weeks.week', { week: data.last_iso_week }),
      theme: { light: 'var(--chart-3)', dark: 'var(--chart-5)' },
    },
    current: {
      label: t('progress.weeks.week', { week: data.iso_week }),
      theme: { light: 'var(--chart-2)', dark: 'var(--chart-1)' },
    },
  } satisfies ChartConfig
  const rows = data.days.map((day) => ({
    day: labels.weekdayShort(day.weekday as Weekday),
    last: toUnit(day.last_week, unit),
    current: toUnit(day.this_week, unit),
  }))

  if (rows.length === 0) return null
  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={HEADING}>{t('progress.weeks.byDay')}</h2>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <ChartContainer config={config} className="aspect-auto h-44 w-full">
        <BarChart data={rows} barGap={2} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            width={36}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => compact.format(value)}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
            content={<ChartTooltipContent indicator="line" />}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="last" fill="var(--color-last)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Bar
            dataKey="current"
            fill="var(--color-current)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
      <Button variant="ghost" size="touch" className="justify-self-start px-2" onClick={() => setShowTable((shown) => !shown)}>
        {showTable ? t('progress.weeks.hideTable') : t('progress.weeks.showTable')}
      </Button>
      {showTable && (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[0.6875rem] text-muted-foreground uppercase">
              <th scope="col" className="pb-1 font-medium">{t('progress.weeks.day')}</th>
              <th scope="col" className="pb-1 text-right font-medium">{config.last.label}</th>
              <th scope="col" className="pb-1 text-right font-medium">{config.current.label}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day} className="border-t">
                <td className="py-2">{row.day}</td>
                <td className="py-2 text-right text-muted-foreground tabular-nums">{formatNumber(row.last, locale)}</td>
                <td className="py-2 text-right tabular-nums">{formatNumber(row.current, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function TodayTable({ data }: { data: WeekComparison }) {
  const { t, i18n } = useTranslation()
  const { user } = useRequiredSession()
  const locale = i18n.language
  const value = (kg: number | null) => (kg === null ? '—' : formatNumber(toUnit(kg, user.unit), locale))

  return (
    <section className="grid gap-2" aria-labelledby="today-vs">
      <h2 id="today-vs" className={HEADING}>
        {t('progress.weeks.today')}
      </h2>
      {data.today === null ? (
        <p className="text-sm text-muted-foreground">{t('progress.weeks.noToday')}</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[0.6875rem] text-muted-foreground uppercase">
              <th scope="col" className="pb-1 font-medium">{t('progress.weeks.exercise')}</th>
              <th scope="col" className="pb-1 text-right font-medium">
                {t('progress.weeks.weekShort', { week: data.last_iso_week })}
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                {t('progress.weeks.weekShort', { week: data.iso_week })}
              </th>
              <th scope="col" className="pb-1 text-right font-medium">{t('progress.weeks.delta')}</th>
            </tr>
          </thead>
          <tbody>
            {data.today.exercises.map((row) => {
              const difference =
                row.this_week !== null && row.last_week !== null ? toUnit(row.this_week - row.last_week, user.unit) : null
              return (
                <tr key={row.exercise_id} className="border-t">
                  <td className="max-w-40 truncate py-2.5 pr-2">{row.name}</td>
                  <td className="py-2.5 text-right text-muted-foreground tabular-nums">{value(row.last_week)}</td>
                  <td className="py-2.5 text-right tabular-nums">{value(row.this_week)}</td>
                  <td
                    className={cn(
                      'py-2.5 text-right tabular-nums',
                      difference === null ? 'text-muted-foreground' : TONE[toneOf(difference)],
                    )}
                  >
                    {row.this_week === null
                      ? t('progress.weeks.pending')
                      : difference === null
                        ? '—'
                        : difference === 0
                          ? '='
                          : formatSigned(difference, locale)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
