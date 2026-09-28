import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'

import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatTime } from '@/lib/format'

import type { HeartRatePoint, SessionExercise } from './types'

const TABLE_BUCKET_MS = 5 * 60_000

/** The exercise being done at `at`: the last one whose first set came before it. */
function exerciseAt(exercises: SessionExercise[], at: number): SessionExercise | undefined {
  return exercises.findLast((exercise) => Date.parse(exercise.first_set_at) <= at)
}

type HeartRateChartProps = {
  points: HeartRatePoint[]
  exercises: SessionExercise[]
  timeZone: string
}

/** One series: a 2px line over a 10% wash, a dashed rule where each exercise starts, crosshair
 * tooltip with the exercise at that moment. The table twin averages it per 5 minutes. */
export function HeartRateChart({ points, exercises, timeZone }: HeartRateChartProps) {
  const { t, i18n } = useTranslation()
  const [showTable, setShowTable] = useState(false)
  const language = i18n.language
  const config = { bpm: { label: t('health.session.heartRate'), color: 'var(--heart)' } } satisfies ChartConfig
  const data = points.map((point) => ({ at: Date.parse(point.at), bpm: point.bpm }))
  const time = (at: number) => formatTime(new Date(at).toISOString(), language, timeZone)

  return (
    <>
      <ChartContainer config={config} className="aspect-auto h-40 w-full">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="at"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            tickFormatter={time}
          />
          <YAxis width={32} tickLine={false} axisLine={false} tickMargin={4} domain={['dataMin - 10', 'dataMax + 5']} />
          {exercises.map((exercise) => (
            <ReferenceLine
              key={exercise.exercise_id}
              x={Date.parse(exercise.first_set_at)}
              stroke="var(--color-border)"
              strokeDasharray="2 3"
            />
          ))}
          <ChartTooltip
            cursor={{ stroke: 'var(--color-border)' }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const at = payload[0]?.payload?.at as number | undefined
                  if (at === undefined) return ''
                  const exercise = exerciseAt(exercises, at)
                  return exercise ? `${time(at)} · ${exercise.name}` : time(at)
                }}
                formatter={(value) => (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">{config.bpm.label}</span>
                    <span className="font-medium text-foreground tabular-nums">
                      {t('health.session.bpm', { value })}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Area
            dataKey="bpm"
            type="monotone"
            stroke="var(--color-bpm)"
            strokeWidth={2}
            fill="var(--color-bpm)"
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--color-bpm)', stroke: 'var(--color-card)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      <Button
        variant="ghost"
        size="touch"
        className="justify-self-start px-2"
        onClick={() => setShowTable((shown) => !shown)}
      >
        {showTable ? t('health.session.hideTable') : t('health.session.showTable')}
      </Button>
      {showTable && <HeartRateTable data={data} exercises={exercises} time={time} />}
    </>
  )
}

function HeartRateTable({
  data,
  exercises,
  time,
}: {
  data: Array<{ at: number; bpm: number }>
  exercises: SessionExercise[]
  time: (at: number) => string
}) {
  const { t } = useTranslation()
  const buckets = new Map<number, number[]>()
  const start = data[0]?.at ?? 0
  for (const point of data) {
    const bucket = start + Math.floor((point.at - start) / TABLE_BUCKET_MS) * TABLE_BUCKET_MS
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), point.bpm])
  }
  return (
    <table className="w-full text-[13px]">
      <caption className="sr-only">{t('health.session.heartRate')}</caption>
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-1 font-normal">{t('health.session.time')}</th>
          <th className="py-1 font-normal">{t('health.session.exercise')}</th>
          <th className="py-1 text-right font-normal">{t('health.session.avgHr')}</th>
        </tr>
      </thead>
      <tbody>
        {[...buckets].map(([at, values]) => (
          <tr key={at} className="border-t">
            <td className="py-1.5 tabular-nums">{time(at)}</td>
            <td className="max-w-0 truncate py-1.5 pr-2">{exerciseAt(exercises, at + TABLE_BUCKET_MS / 2)?.name ?? ''}</td>
            <td className="py-1.5 text-right tabular-nums">
              {Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
