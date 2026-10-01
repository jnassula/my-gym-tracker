import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { formatSigned } from '@/features/progress/format'

import { adminOverviewQuery, growthQuery, usersQuery } from './api'
import { difference, formatCount, percentOf } from './format'
import { GrowthChart } from './growth-chart'
import { METRICS, RANGES, type AdminOverview, type Change, type Funnel, type Metric, type Range } from './types'
import { UsersTable } from './users-table'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'
const RECENT = 5
const FUNNEL_STEPS = ['registered', 'with_plan', 'trained', 'active_30d'] as const satisfies ReadonlyArray<keyof Funnel>

type DashboardScreenProps = {
  range: Range
  metric: Metric
  onRangeChange: (range: Range) => void
  onMetricChange: (metric: Metric) => void
}

/** Visão geral: how many accounts there are, how fast they arrive and how many come back. */
export function DashboardScreen(props: DashboardScreenProps) {
  const { t } = useTranslation()
  const overview = useQuery(adminOverviewQuery())

  if (overview.isPending) return <Spinner className="mx-auto size-6 text-muted-foreground" />
  if (overview.isError) return <FormAlert messageKey={errorKey(overview.error)} />
  return (
    <div className="grid gap-6">
      <h1 className="sr-only">{t('admin.nav.overview')}</h1>
      <Tiles data={overview.data} />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <GrowthCard {...props} />
        <div className="grid gap-6">
          <FunnelCard funnel={overview.data.funnel} />
          <AdoptionCard data={overview.data} />
        </div>
      </div>
      <RecentAccounts />
      <p className="text-xs text-muted-foreground">{t('admin.privacy')}</p>
    </div>
  )
}

function Tiles({ data }: { data: AdminOverview }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const week = t('admin.tiles.week')
  const month = t('admin.tiles.month')
  return (
    <section aria-label={t('admin.tiles.label')} className="grid gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          label={t('admin.tiles.totalUsers')}
          value={data.total_users}
          note={t('admin.tiles.workoutsTotal', {
            count: data.workouts_total,
            formatted: formatCount(data.workouts_total, language),
          })}
        />
        <Tile label={t('admin.tiles.newUsers', { period: week })} change={data.new_users_7d} period={week} />
        <Tile label={t('admin.tiles.newUsers', { period: month })} change={data.new_users_30d} period={month} />
        <Tile label={t('admin.tiles.activeUsers', { period: week })} change={data.active_users_7d} period={week} />
        <Tile label={t('admin.tiles.activeUsers', { period: month })} change={data.active_users_30d} period={month} />
        <Tile label={t('admin.tiles.workouts', { period: week })} change={data.workouts_7d} period={week} />
      </div>
      <p className="text-xs text-muted-foreground">{t('admin.tiles.activeHint')}</p>
    </section>
  )
}

type TileProps = { label: string } & (
  | { value: number; note: string; change?: never; period?: never }
  | { change: Change; period: string; value?: never; note?: never }
)

/** A figure and, below it, how it compares with the period before. */
function Tile({ label, value, note, change, period }: TileProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const moved = change ? difference(change) : 0
  return (
    <div className="grid content-start gap-0.5 rounded-xl bg-card p-3">
      <span className="text-[0.6875rem] text-muted-foreground">{label}</span>
      <span className="text-[22px] font-medium tabular-nums">{formatCount(change ? change.current : value, language)}</span>
      {change ? (
        <span
          className={cn(
            'text-xs',
            moved > 0 ? 'text-primary' : moved < 0 ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {moved === 0
            ? t('admin.tiles.same')
            : t('admin.tiles.versus', { change: formatSigned(moved, language), period })}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{note}</span>
      )}
    </div>
  )
}

function Picker<T extends string>(props: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <ToggleGroup
      value={[props.value]}
      // Pressing the selected option again would clear it: keep one selected.
      onValueChange={(value) => value[0] && props.onChange(value[0] as T)}
      aria-label={props.label}
      spacing={0}
      className="grid grid-cols-3 rounded-xl bg-background p-1"
    >
      {props.options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="h-10 rounded-lg px-3 text-[13px] text-muted-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function GrowthCard({ range, metric, onRangeChange, onMetricChange }: DashboardScreenProps) {
  const { t } = useTranslation()
  const growth = useQuery(growthQuery(range))
  return (
    <Card className="gap-3 px-4 py-4 lg:col-span-2">
      {/* Filters in one row above the chart; they wrap on a phone. */}
      <div className="flex flex-wrap items-center gap-2">
        <Picker
          label={t('admin.growth.metricLabel')}
          value={metric}
          options={METRICS.map((value) => ({ value, label: t(`admin.growth.metric.${value}`) }))}
          onChange={onMetricChange}
        />
        <Picker
          label={t('admin.growth.rangeLabel')}
          value={range}
          options={RANGES.map((value) => ({ value, label: t(`admin.growth.range.${value}`) }))}
          onChange={onRangeChange}
        />
      </div>
      {growth.isPending ? (
        <Spinner className="mx-auto my-20 size-6 text-muted-foreground" />
      ) : growth.isError ? (
        <FormAlert messageKey={errorKey(growth.error)} />
      ) : (
        // While another range loads, the previous one stays, dimmed (no layout jump).
        <div className={cn('grid gap-3 transition-opacity', growth.isPlaceholderData && 'opacity-60')}>
          <div className="grid gap-0.5">
            <h2 className={HEADING}>
              {t('admin.growth.chartTitle', {
                series: t(`admin.growth.series.${metric}`),
                unit: t(`admin.growth.unit.${growth.data.unit}`),
              })}
            </h2>
            {/* Today, this week or this month isn't over: its bar is not a drop. */}
            <p className="text-xs text-muted-foreground">{t('admin.growth.partial')}</p>
          </div>
          <GrowthChart growth={growth.data} metric={metric} />
        </div>
      )}
    </Card>
  )
}

/** Each step as a share of every account: one hue, the first step in the accent. */
function FunnelCard({ funnel }: { funnel: Funnel }) {
  const { t, i18n } = useTranslation()
  return (
    <Card className="gap-3 px-4 py-4">
      <div className="grid gap-0.5">
        <h2 className={HEADING}>{t('admin.funnel.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('admin.funnel.hint')}</p>
      </div>
      <ul className="grid gap-3">
        {FUNNEL_STEPS.map((step, index) => {
          const percent = percentOf(funnel[step], funnel.registered)
          return (
            <li key={step} className="grid gap-1.5 text-[13px]">
              <span className="flex items-baseline justify-between gap-3">
                <span>{t(`admin.funnel.steps.${step}`)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatCount(funnel[step], i18n.language)} · {percent}%
                </span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full', index === 0 ? 'bg-primary' : 'bg-primary/45')}
                  style={{ width: `${percent}%` }}
                />
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function AdoptionCard({ data }: { data: AdminOverview }) {
  const { t, i18n } = useTranslation()
  const share = (accounts: number) =>
    `${formatCount(accounts, i18n.language)} · ${percentOf(accounts, data.total_users)}%`
  const rows = [
    { label: t('admin.adoption.deactivated'), value: share(data.deactivated_users) },
    { label: t('admin.adoption.appleHealth'), value: share(data.adoption.apple_health) },
    { label: t('admin.adoption.healthConnect'), value: share(data.adoption.health_connect) },
    { label: t('admin.adoption.notifications'), value: share(data.adoption.notifications) },
    ...data.languages.map(({ language, users }) => ({
      label: t('admin.adoption.language', { language: language.toUpperCase() }),
      value: share(users),
    })),
  ]
  return (
    <Card className="gap-3 px-4 py-4">
      <h2 className={HEADING}>{t('admin.adoption.title')}</h2>
      <dl className="grid divide-y text-[13px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <dt>{row.label}</dt>
            <dd className="text-muted-foreground tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function RecentAccounts() {
  const { t } = useTranslation()
  const users = useInfiniteQuery(usersQuery('', RECENT))
  const recent = users.data?.pages[0]?.items ?? []
  return (
    <Card className="gap-3 px-1 py-4">
      <div className="flex items-center justify-between gap-3 px-3">
        <h2 className={HEADING}>{t('admin.users.recent')}</h2>
        <Link to="/admin/users" className="flex min-h-11 items-center text-sm text-primary">
          {t('admin.users.seeAll')}
        </Link>
      </div>
      {users.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : users.isError ? (
        <div className="px-3">
          <FormAlert messageKey={errorKey(users.error)} />
        </div>
      ) : (
        <UsersTable users={recent} caption={t('admin.users.recent')} />
      )}
    </Card>
  )
}
