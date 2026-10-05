import { cn } from 'cn'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { ConfirmDialog } from '@/features/workouts/builder/confirm-dialog'
import { useWorkoutLabels } from '@/features/workouts/labels'
import { WEEKDAYS, type Weekday } from '@/features/workouts/types'
import { formatList } from '@/lib/format'

import { useArchiveActivity, useSaveActivity } from './api'
import { avoided } from './rules'
import { REGIONS, type Activity, type ActivityDraft, type PlanDayRegions, type Region } from './types'

// On the sheet's own surface: the page's background sets an unpressed chip apart.
const CHIP = cn(
  'h-12 w-full rounded-xl bg-background text-sm text-muted-foreground',
  'aria-pressed:bg-primary aria-pressed:text-primary-foreground',
)

type ActivitySheetProps = {
  /** The activity to change, or null for a new one. */
  activity: Activity | null
  /** The active plan's days by region, to say what the activity will keep away. */
  planDays: PlanDayRegions[]
  onClose: () => void
}

/**
 * An activity's name, the weekdays it is always on (none: marked by hand on the day) and the
 * regions of the body it shouldn't share a day with. Mount it to open it: the form starts from
 * the activity it is given.
 */
export function ActivitySheet({ activity, planDays, onClose }: ActivitySheetProps) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const id = useId()
  const save = useSaveActivity()
  const archive = useArchiveActivity()
  const [draft, setDraft] = useState<ActivityDraft>({
    name: activity?.name ?? '',
    weekdays: activity?.weekdays ?? [],
    avoid: activity?.avoid ?? [],
  })
  const [confirming, setConfirming] = useState(false)
  const name = draft.name.trim()
  const kept = avoided(planDays, draft.avoid)

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[92dvh] max-w-md gap-5 overflow-y-auto rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        <div aria-hidden className="mx-auto h-1 w-10 shrink-0 rounded-full bg-border" />
        <SheetTitle className="text-lg">{activity ? t('activities.edit') : t('activities.add')}</SheetTitle>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (name) save.mutate({ id: activity?.id ?? null, draft: { ...draft, name } }, { onSuccess: onClose })
          }}
        >
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>{t('activities.name')}</FieldLabel>
            <Input
              id={`${id}-name`}
              value={draft.name}
              maxLength={40}
              autoComplete="off"
              placeholder={t('activities.namePlaceholder')}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>

          <Field>
            <FieldLabel>{t('activities.weekdays')}</FieldLabel>
            <ToggleGroup
              multiple
              value={draft.weekdays.map(String)}
              onValueChange={(next) => setDraft({ ...draft, weekdays: next.map(Number).sort() as Weekday[] })}
              aria-label={t('activities.weekdays')}
              className="grid w-full grid-cols-7 gap-1.5"
            >
              {WEEKDAYS.map((weekday) => (
                <ToggleGroupItem
                  key={weekday}
                  value={String(weekday)}
                  aria-label={labels.weekdayLong(weekday)}
                  className={CHIP}
                >
                  {t(`weekdays.initial.${weekday}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>{t('activities.weekdaysHint')}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>{t('activities.avoid')}</FieldLabel>
            <ToggleGroup
              multiple
              value={draft.avoid}
              onValueChange={(next) =>
                setDraft({ ...draft, avoid: REGIONS.filter((region) => next.includes(region)) })
              }
              aria-label={t('activities.avoid')}
              className="grid w-full grid-cols-3 gap-1.5"
            >
              {REGIONS.map((region: Region) => (
                <ToggleGroupItem key={region} value={region} className={CHIP}>
                  {t(`activities.regions.${region}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>
              {/* Worked out from the plan's exercises: shown, so a wrong guess can be seen. */}
              {draft.avoid.length === 0 || planDays.length === 0
                ? t('activities.avoidHint')
                : kept.length > 0
                  ? t('activities.avoids', {
                      days: formatList(
                        kept.map((day) => day.label || labels.weekdayLong(day.weekday)),
                        i18n.language,
                      ),
                    })
                  : t('activities.avoidsNone')}
            </FieldDescription>
          </Field>

          {(save.error ?? archive.error) && <FormAlert messageKey={errorKey(save.error ?? archive.error)} />}
          <div className="grid gap-2">
            <Button type="submit" size="hero" disabled={!name || save.isPending}>
              {t('activities.save')}
            </Button>
            <Button type="button" variant="outline" size="touch" onClick={onClose}>
              {t('activities.cancel')}
            </Button>
            {activity && (
              <Button
                type="button"
                variant="ghost"
                size="touch"
                className="text-destructive"
                disabled={archive.isPending}
                onClick={() => setConfirming(true)}
              >
                {t('activities.archive')}
              </Button>
            )}
          </div>
        </form>
        <ConfirmDialog
          confirmation={
            confirming && activity
              ? {
                  title: t('activities.archiveTitle', { name: activity.name }),
                  body: t('activities.archiveBody'),
                  confirmLabel: t('activities.archiveConfirm'),
                  onConfirm: () => archive.mutate(activity.id, { onSuccess: onClose }),
                }
              : null
          }
          onClose={() => setConfirming(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
