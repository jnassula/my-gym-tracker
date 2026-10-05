import { CaretRightIcon, CheckIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useDayDate } from '@/features/training/day-date'
import { dayRows, type DayRow } from '@/features/training/plan'
import type { PlanWeek } from '@/features/training/types'
import { useWorkoutLabels } from '@/features/workouts/labels'
import type { Plan } from '@/features/workouts/types'

type SwitchSheetProps = { plan: Plan; week: PlanWeek; open: boolean; onOpenChange: (open: boolean) => void }

/**
 * "Trocar": the plan's workouts, each with how it stands this week. The plan's order is a
 * suggestion; the user opens the one that fits the day (another sport tomorrow, tired legs).
 */
export function SwitchSheet({ plan, week, open, onOpenChange }: SwitchSheetProps) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[85dvh] max-w-md gap-4 overflow-y-auto rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        <div aria-hidden className="mx-auto h-1 w-10 shrink-0 rounded-full bg-border" />
        <div className="grid gap-0.5">
          <SheetTitle className="text-lg">{t('home.pick.title')}</SheetTitle>
          <SheetDescription>{t('home.pick.description')}</SheetDescription>
        </div>
        <ul className="grid gap-2">
          {dayRows(plan.days, week).map((row) => (
            <li key={row.day.id}>
              <PickLink planId={plan.id} row={row} />
            </li>
          ))}
        </ul>
        <Button variant="outline" size="touch" onClick={() => onOpenChange(false)}>
          {t('home.pick.close')}
        </Button>
      </SheetContent>
    </Sheet>
  )
}

function PickLink({ planId, row }: { planId: string; row: DayRow }) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const dayDate = useDayDate()
  const total = row.day.exercises.length
  const detail =
    row.state === 'today'
      ? t('home.pick.today', { done: row.done, total })
      : row.state === 'trained' && row.date
        ? t('home.pick.doneOn', { count: total, when: dayDate(row.date) })
        : t('home.pick.pending', { count: total })

  return (
    <Link
      to="/workouts/$planId/days/$dayId"
      params={{ planId, dayId: row.day.id }}
      search={{ from: 'home' }}
      className={cn(
        'flex min-h-15 items-center gap-3 rounded-xl bg-background px-3 py-2',
        row.suggested && 'ring-1 ring-primary',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium">{row.day.label || labels.weekdayLong(row.day.weekday)}</span>
          {row.suggested && (
            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] text-primary">
              {t('home.pick.suggested')}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      {row.trained ? (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon aria-hidden weight="bold" className="size-4" />
        </span>
      ) : (
        <CaretRightIcon aria-hidden className="size-4 shrink-0 text-primary" />
      )}
    </Link>
  )
}
