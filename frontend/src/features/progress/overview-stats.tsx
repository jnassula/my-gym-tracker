import { CaretRightIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { formatVolume } from '@/features/training/weight'
import { useRequiredSession } from '@/lib/auth'

import type { ProgressOverview } from './types'

type Stats = Pick<ProgressOverview, 'week_streak' | 'week_volume' | 'records_this_month'>

/** Streak, this week's volume and this month's records: on Progresso and on Início. */
export function OverviewStats({ data }: { data: Stats }) {
  const { t, i18n } = useTranslation()
  const { user } = useRequiredSession()
  return (
    <div className="grid grid-cols-3 gap-2">
      <StatTile value={String(data.week_streak)} label={t('progress.streak')} to="/progress/calendar" />
      <StatTile
        value={formatVolume(data.week_volume, user.unit, i18n.language)}
        label={t('progress.weekVolume')}
        to="/progress/weeks"
      />
      <StatTile value={String(data.records_this_month)} label={t('progress.recordsMonth')} highlight />
    </div>
  )
}

function StatTile({ value, label, to, highlight }: { value: string; label: string; to?: '/progress/calendar' | '/progress/weeks'; highlight?: boolean }) {
  const body: ReactNode = (
    <>
      <span className={cn('text-[22px] font-medium', highlight && 'text-primary')}>{value}</span>
      <span className="flex items-center justify-between gap-1 text-[0.6875rem] text-muted-foreground">
        {label}
        {to && <CaretRightIcon aria-hidden className="size-3 shrink-0" />}
      </span>
    </>
  )
  const className = 'grid min-h-11 content-between gap-1 rounded-xl bg-card p-3 text-left'
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
