import { CaretRightIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { useWorkoutLabels } from '@/features/workouts/labels'
import { formatList } from '@/lib/format'

import { ActivitySheet } from './activity-sheet'
import { activitiesQuery } from './api'
import type { Activity } from './types'

/**
 * Definições → Atividades: what the user does besides the gym (footvolley, surf), so that the
 * workout suggested each day goes with it.
 */
export function ActivitiesScreen() {
  const { t } = useTranslation()
  const activities = useQuery(activitiesQuery())
  // The activity being changed, "new" for one being added, null with the sheet closed.
  const [editing, setEditing] = useState<Activity | 'new' | null>(null)

  return (
    <Page title={t('activities.title')} back="/settings">
      {activities.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : activities.isError ? (
        <FormAlert messageKey={errorKey(activities.error)} />
      ) : (
        <div className="grid gap-5">
          <p className="text-sm text-muted-foreground">{t('activities.intro')}</p>
          {activities.data.activities.length === 0 ? (
            <p className="rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground">{t('activities.empty')}</p>
          ) : (
            <Card className="gap-0 divide-y py-0">
              {activities.data.activities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} onOpen={() => setEditing(activity)} />
              ))}
            </Card>
          )}
          <Button size="hero" onClick={() => setEditing('new')}>
            {t('activities.add')}
          </Button>
          {editing && (
            <ActivitySheet
              key={editing === 'new' ? 'new' : editing.id}
              activity={editing === 'new' ? null : editing}
              planDays={activities.data.plan_days}
              onClose={() => setEditing(null)}
            />
          )}
        </div>
      )}
    </Page>
  )
}

function ActivityRow({ activity, onOpen }: { activity: Activity; onOpen: () => void }) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const hint = [
    activity.weekdays.length > 0
      ? activity.weekdays.map((weekday) => labels.weekdayShort(weekday)).join(', ')
      : t('activities.noFixedDay'),
    activity.avoid.length > 0
      ? t('activities.avoidsRegions', {
          regions: formatList(
            activity.avoid.map((region) => t(`activities.regions.${region}`).toLocaleLowerCase(i18n.language)),
            i18n.language,
          ),
        })
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-13 w-full items-center gap-3 px-4 py-1.5 text-left text-[15px] hover:bg-accent/50"
    >
      <span className="grid flex-1 gap-0.5">
        {activity.name}
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <CaretRightIcon aria-hidden className="size-4 text-muted-foreground" />
    </button>
  )
}
