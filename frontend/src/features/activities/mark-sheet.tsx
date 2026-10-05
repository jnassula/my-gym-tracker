import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, buttonVariants } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { addDays } from '@/features/training/plan'
import type { PlanWeek } from '@/features/training/types'
import { useWorkoutLabels } from '@/features/workouts/labels'
import { WEEKDAYS } from '@/features/workouts/types'

import { useSetActivityDay } from './api'
import { isOn } from './rules'
import type { Activity } from './types'

const CHIP = cn(
  'h-12 w-full rounded-xl bg-background text-sm text-muted-foreground',
  'aria-pressed:bg-primary aria-pressed:text-primary-foreground',
)

type MarkSheetProps = {
  activities: Activity[]
  week: PlanWeek
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The week's days of each activity, to mark ahead ("surf on Thursday") or to take one off
 * ("não fui"): what today's suggestion looks at, a day ahead.
 */
export function MarkSheet({ activities, week, open, onOpenChange }: MarkSheetProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const setDay = useSetActivityDay()
  const [chosen, setChosen] = useState<string | null>(null)
  const activity = activities.find((item) => item.id === chosen) ?? activities[0]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-md gap-4 rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
        <div className="grid gap-0.5">
          <SheetTitle className="text-lg">{t('activities.mark.title')}</SheetTitle>
          <SheetDescription>{t('activities.mark.description')}</SheetDescription>
        </div>
        {activity && (
          <>
            {activities.length > 1 && (
              <ToggleGroup
                value={[activity.id]}
                onValueChange={(next) => next[0] && setChosen(next[0])}
                aria-label={t('activities.mark.which')}
                className="flex w-full flex-wrap gap-1.5"
              >
                {activities.map((item) => (
                  <ToggleGroupItem key={item.id} value={item.id} className={cn(CHIP, 'w-auto px-4')}>
                    {item.name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            <div
              role="group"
              aria-label={t('activities.mark.days', { name: activity.name })}
              className="grid grid-cols-7 gap-1.5"
            >
              {WEEKDAYS.map((weekday) => {
                const date = addDays(week.week_start, weekday)
                const on = isOn(week, activity.id, date)
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={on}
                    aria-label={labels.weekdayLong(weekday)}
                    aria-current={date === week.today ? 'date' : undefined}
                    disabled={setDay.isPending}
                    onClick={() => setDay.mutate({ activityId: activity.id, date, on: !on })}
                    className={cn(CHIP, date === week.today && 'ring-1 ring-primary ring-inset')}
                  >
                    {t(`weekdays.initial.${weekday}`)}
                  </button>
                )
              })}
            </div>
          </>
        )}
        {setDay.isError && <FormAlert messageKey={errorKey(setDay.error)} />}
        <Link to="/settings/activities" className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }))}>
          {t('activities.mark.manage')}
        </Link>
        <Button variant="outline" size="touch" onClick={() => onOpenChange(false)}>
          {t('activities.mark.close')}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
