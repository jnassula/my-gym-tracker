import { CaretRightIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Sparkline } from '@/features/progress/sparkline'
import { formatWeight } from '@/features/training/weight'
import { useRequiredSession } from '@/lib/auth'

import { bodyQuery } from './api'
import { localDay } from './format'

/** Progresso's way into the body weight screen: the latest weighing and the last three months. */
export function BodyCard() {
  const { t, i18n } = useTranslation()
  const { user } = useRequiredSession()
  const body = useQuery(bodyQuery('3m'))
  const latest = body.data?.latest
  const points = body.data?.points ?? []
  return (
    <Link to="/progress/body" className="flex min-h-14 items-center gap-3 rounded-xl bg-card px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{t('body.title')}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {latest
            ? `${formatWeight(latest.weight, user.unit, i18n.language)} · ${localDay(latest.measured_at, user.timezone, i18n.language)}`
            : t('body.card.empty')}
        </span>
      </span>
      {points.length > 1 && (
        <Sparkline values={points.map((point) => point.weight)} width={60} height={24} className="text-primary" />
      )}
      <CaretRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
