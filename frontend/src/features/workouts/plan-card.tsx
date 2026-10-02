import { CaretRightIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { formatDate } from './format'
import { useWorkoutLabels } from './labels'
import { WEEKDAYS, type PlanSummary } from './types'

/** A plan in the Treinos list: name, status, training days of the week. */
export function PlanCard({ plan }: { plan: PlanSummary }) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  return (
    <Link to="/workouts/$planId" params={{ planId: plan.id }} className="block rounded-xl">
      <Card className={cn('gap-3 px-4', plan.is_active && 'ring-primary/60')}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base">{plan.name}</h2>
              {plan.is_active && <Badge>{t('workouts.active')}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {t(plan.source_file ? 'workouts.imported' : 'workouts.created', {
                date: formatDate(plan.created_at.slice(0, 10), i18n.language),
              })}
              {' · '}
              {labels.summary(plan.weekdays.length, plan.exercise_count)}
            </p>
          </div>
          <CaretRightIcon className="mt-1 size-4 text-muted-foreground" />
        </div>
        <ol className="grid grid-cols-7 gap-1" aria-label={t('import.review.days')}>
          {WEEKDAYS.map((weekday) => {
            const training = plan.weekdays.includes(weekday)
            return (
              <li
                key={weekday}
                className={cn(
                  'rounded-md py-1 text-center text-[0.6875rem]',
                  training ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                )}
              >
                {labels.weekdayShort(weekday)}
                <span className="sr-only">{training ? '' : ` · ${t('workouts.restDay')}`}</span>
              </li>
            )
          })}
        </ol>
        {plan.valid_until && (
          <p className="text-xs text-muted-foreground">
            {t('workouts.validUntil', { date: formatDate(plan.valid_until, i18n.language) })}
          </p>
        )}
      </Card>
    </Link>
  )
}
