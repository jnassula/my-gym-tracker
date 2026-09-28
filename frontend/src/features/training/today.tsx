import { CoffeeIcon, ListChecksIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/app-shell/empty-state'
import { Page } from '@/components/app-shell/page'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { planQuery } from '@/features/workouts/api'
import { useWorkoutLabels } from '@/features/workouts/labels'

import { weekQuery } from './api'
import { DayScreen } from './day-screen'
import { weekdayOf } from './plan'

/** Hoje: today's day of the active plan, straight away; on a rest day, what comes next. */
export function TodayScreen({ planId }: { planId: string }) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const plan = useQuery(planQuery(planId))
  const week = useQuery(weekQuery(planId))

  if (plan.isPending || week.isPending) {
    return (
      <Page title={t('nav.today')}>
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      </Page>
    )
  }
  if (plan.isError || week.isError) {
    return (
      <Page title={t('nav.today')}>
        <FormAlert messageKey={errorKey(plan.error ?? week.error)} />
      </Page>
    )
  }

  const today = weekdayOf(week.data.today)
  const day = plan.data.days.find((item) => item.weekday === today)
  if (day) return <DayScreen plan={plan.data} dayId={day.id} isToday fromToday />

  // The next training weekday after today, wrapping into next week.
  const [next] = plan.data.days
    .filter((item) => item.weekday !== null)
    .sort((a, b) => (((a.weekday ?? 0) - today + 7) % 7) - (((b.weekday ?? 0) - today + 7) % 7))
  const description = !next
    ? t('training.restToday.chooseDescription')
    : next.label
      ? t('training.restToday.next', { weekday: labels.weekdayLong(next.weekday), label: next.label })
      : t('training.restToday.nextNoLabel', { weekday: labels.weekdayLong(next.weekday) })

  return (
    <Page title={t('nav.today')}>
      <div className="grid gap-4">
        <EmptyState
          icon={next ? CoffeeIcon : ListChecksIcon}
          title={next ? t('training.restToday.title') : t('training.restToday.chooseTitle')}
          description={description}
        />
        <Link
          to="/workouts/$planId"
          params={{ planId }}
          className={cn(buttonVariants({ variant: 'outline-primary', size: 'hero' }))}
        >
          {t('training.restToday.seeWeek')}
        </Link>
      </div>
    </Page>
  )
}
