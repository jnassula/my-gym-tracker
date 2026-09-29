import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatDayMonth } from '@/lib/format'

import { formatBucketTick, formatCount, formatMonthYear } from './format'
import { METRICS, type Growth, type Metric, type Unit } from './types'

const MARGIN = { top: 12, right: 12, bottom: 0, left: 0 }
/** Past this many points the dots would touch: the line alone, a dot under the pointer. */
const DOTS_UP_TO = 12

function useBucketLabel(unit: Unit) {
  const { t, i18n } = useTranslation()
  return (start: string) =>
    unit === 'month'
      ? formatMonthYear(start, i18n.language)
      : unit === 'week'
        ? t('admin.growth.weekOf', { date: formatDayMonth(start, i18n.language) })
        : formatDayMonth(start, i18n.language, true)
}

/**
 * One series at a time, so no legend: the title names it. What happened in each period (new,
 * active) is a bar; the running total is a line over a wash, from zero.
 */
export function GrowthChart({ growth, metric }: { growth: Growth; metric: Metric }) {
  const { t, i18n } = useTranslation()
  const [showTable, setShowTable] = useState(false)
  const language = i18n.language
  const bucketLabel = useBucketLabel(growth.unit)
  const config = {
    [metric]: { label: t(`admin.growth.series.${metric}`), color: 'var(--chart-1)' },
  } satisfies ChartConfig
  const color = `var(--color-${metric})`

  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="start"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        minTickGap={24}
        tickFormatter={(start: string) => formatBucketTick(start, growth.unit, language)}
      />
      <YAxis
        width={40}
        tickLine={false}
        axisLine={false}
        tickMargin={4}
        allowDecimals={false}
        domain={[0, 'auto']}
        tickFormatter={(value: number) => formatCount(value, language)}
      />
    </>
  )
  const tooltip = (
    <ChartTooltipContent
      labelFormatter={(_, payload) => {
        const start = payload[0]?.payload?.start as string | undefined
        return start ? bucketLabel(start) : ''
      }}
      formatter={(value) => (
        <div className="flex w-full items-center justify-between gap-4">
          <span className="text-muted-foreground">{config[metric].label}</span>
          <span className="font-medium text-foreground tabular-nums">{formatCount(Number(value), language)}</span>
        </div>
      )}
    />
  )

  return (
    <>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        {metric === 'total_users' ? (
          <AreaChart data={growth.points} margin={MARGIN} accessibilityLayer>
            {axes}
            <ChartTooltip cursor={{ stroke: 'var(--color-border)' }} content={tooltip} />
            <Area
              dataKey={metric}
              type="linear"
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.1}
              dot={
                growth.points.length <= DOTS_UP_TO && {
                  r: 4,
                  fill: color,
                  stroke: 'var(--color-card)',
                  strokeWidth: 2,
                }
              }
              activeDot={{ r: 5, fill: color, stroke: 'var(--color-card)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <BarChart data={growth.points} margin={MARGIN} barCategoryGap={2} accessibilityLayer>
            {axes}
            <ChartTooltip cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }} content={tooltip} />
            <Bar dataKey={metric} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        )}
      </ChartContainer>
      <Button
        variant="ghost"
        size="touch"
        className="justify-self-start px-2"
        onClick={() => setShowTable((shown) => !shown)}
      >
        {showTable ? t('admin.growth.hideTable') : t('admin.growth.showTable')}
      </Button>
      {showTable && (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[0.6875rem] text-muted-foreground uppercase">
              <th scope="col" className="pb-1 font-medium">{t('admin.growth.period')}</th>
              {METRICS.map((column) => (
                <th key={column} scope="col" className="pb-1 text-right font-medium">
                  {t(`admin.growth.metric.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Newest first: the table is read from today backwards. */}
            {growth.points.toReversed().map((point) => (
              <tr key={point.start} className="border-t">
                <th scope="row" className="py-2 text-left font-normal">{bucketLabel(point.start)}</th>
                {METRICS.map((column) => (
                  <td key={column} className="py-2 text-right tabular-nums">
                    {formatCount(point[column], language)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
