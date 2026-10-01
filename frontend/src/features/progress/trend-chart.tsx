import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatNumber } from '@/features/training/weight'

import { formatShortDate } from './format'

type TrendChartProps = {
  /** In the order to draw them; `value` already in the unit on screen. */
  points: ReadonlyArray<{ date: string; value: number }>
  /** What the series is, for the tooltip: "Série mais pesada". */
  label: string
  /** After the value: "kg", "%". */
  unit: string
}

/** One series over time: a 2px line over a 10% wash, 8px dots ringed in the card colour,
 * crosshair tooltip. */
export function TrendChart({ points, label, unit }: TrendChartProps) {
  const { i18n } = useTranslation()
  const locale = i18n.language
  const config = { value: { label, color: 'var(--chart-1)' } } satisfies ChartConfig

  return (
    <ChartContainer config={config} className="aspect-auto h-48 w-full">
      <AreaChart data={[...points]} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(value: string) => formatShortDate(value, locale)}
        />
        <YAxis
          width={40}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          domain={['auto', 'auto']}
          tickFormatter={(value: number) => formatNumber(value, locale)}
        />
        <ChartTooltip
          cursor={{ stroke: 'var(--color-border)' }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const date = payload[0]?.payload?.date as string | undefined
                return date ? formatShortDate(date, locale) : ''
              }}
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {formatNumber(Number(value), locale)} {unit}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          dataKey="value"
          type="linear"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill="var(--color-value)"
          fillOpacity={0.1}
          dot={{ r: 4, fill: 'var(--color-value)', stroke: 'var(--color-card)', strokeWidth: 2 }}
          activeDot={{ r: 5, fill: 'var(--color-value)', stroke: 'var(--color-card)', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
