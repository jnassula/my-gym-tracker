import { cn } from 'cn'

type SparklineProps = {
  values: number[]
  width: number
  height: number
  /** Stroke colour comes from `currentColor`: set it with a text colour class. */
  className?: string
  /** Mark the last point (the latest session). */
  endDot?: boolean
}

/**
 * A tiny trend line with no axes (a custom piece in the design). Decorative: the numbers it
 * summarises are always written next to it, so it is hidden from assistive technology.
 */
export function Sparkline({ values, width, height, className, endDot = false }: SparklineProps) {
  if (values.length === 0) return null
  const pad = endDot ? 3 : 1.5
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0
  const points = values.map((value, index) => [
    values.length > 1 ? pad + index * step : width / 2,
    pad + (1 - (value - min) / span) * (height - pad * 2),
  ])
  const [lastX, lastY] = points[points.length - 1]
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('shrink-0 overflow-visible', className)}
    >
      {points.length > 1 && (
        <polyline
          points={points.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {(endDot || points.length === 1) && <circle cx={lastX} cy={lastY} r={2.5} fill="currentColor" />}
    </svg>
  )
}
