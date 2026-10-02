import { WarningIcon } from '@phosphor-icons/react'
import { useId, type Dispatch } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { FormAlert } from '@/features/auth/form-parts'

import { formatDate } from '../format'
import { useWorkoutLabels } from '../labels'
import {
  averageMinutes,
  canSave,
  exerciseCount,
  groupsOf,
  trainingDays,
  type BuilderAction,
  type BuilderDraft,
} from './draft'

type StepReviewProps = {
  draft: BuilderDraft
  dispatch: Dispatch<BuilderAction>
  saving: boolean
  errorKey: string | undefined
  onEditDay: (index: number) => void
  onSave: (activate: boolean) => void
}

/** Step 3: the plan at a glance, then activate it or save it for later. */
export function StepReview({ draft, dispatch, saving, errorKey, onEditDay, onSave }: StepReviewProps) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const id = useId()
  const minutes = averageMinutes(draft)
  const nameMissing = draft.name.trim() === ''
  const ready = canSave(draft)

  return (
    <div className="grid gap-5">
      <Field data-invalid={nameMissing}>
        <FieldLabel htmlFor={id}>{t('builder.name.label')}</FieldLabel>
        <Input
          id={id}
          value={draft.name}
          maxLength={120}
          aria-invalid={nameMissing}
          onChange={(event) => dispatch({ type: 'rename', name: event.target.value })}
        />
      </Field>

      <p className="text-sm text-muted-foreground">
        {labels.summary(trainingDays(draft).length, exerciseCount(draft))}
        {minutes !== null && minutes > 0 && ` · ${t('builder.review.minutes', { minutes })}`}
        {draft.validUntil && ` · ${t('workouts.validUntil', { date: formatDate(draft.validUntil, i18n.language) })}`}
      </p>

      <ul className="grid gap-2">
        {draft.days.map((day, index) => {
          const groups = groupsOf(day).filter(({ exercises }) => exercises.length > 0)
          return (
            <li key={day.key}>
              <Card className="gap-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base">{labels.weekdayLong(day.weekday)}</h2>
                  <span className="text-sm text-muted-foreground">
                    {day.exercises.length > 0
                      ? t('builder.review.exerciseCount', { count: day.exercises.length })
                      : t('builder.review.emptyDay')}
                  </span>
                </div>
                {groups.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label={t('exercise.group')}>
                    {groups.map(({ group }) => (
                      <li key={group}>
                        <Badge variant="secondary">{labels.group(group)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {day.exercises.length === 0 && (
                  <Alert className="border-warning/40 bg-warning/10">
                    <WarningIcon className="text-warning" />
                    <AlertTitle className="font-normal">{t('builder.review.emptyDayAlert')}</AlertTitle>
                    <AlertAction>
                      <Button variant="ghost" size="sm" className="h-9 text-primary" onClick={() => onEditDay(index)}>
                        {t('builder.review.edit')}
                      </Button>
                    </AlertAction>
                  </Alert>
                )}
              </Card>
            </li>
          )
        })}
      </ul>

      <FormAlert messageKey={errorKey} />

      <div className="grid gap-2">
        <Button size="hero" disabled={saving || !ready} onClick={() => onSave(true)}>
          {saving ? (
            <>
              <Spinner />
              {t('builder.review.saving')}
            </>
          ) : (
            t('builder.review.activate')
          )}
        </Button>
        <Button variant="outline-primary" size="touch" disabled={saving || !ready} onClick={() => onSave(false)}>
          {t('builder.review.saveOnly')}
        </Button>
        {!ready && (
          <p className="text-center text-sm text-muted-foreground">
            {nameMissing ? t('builder.review.nameMissing') : t('builder.review.noExercises')}
          </p>
        )}
      </div>
    </div>
  )
}
