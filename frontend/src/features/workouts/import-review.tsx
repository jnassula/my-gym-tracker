import { CaretRightIcon, CheckIcon, PlusIcon } from '@phosphor-icons/react'
import { useId, useState, type Dispatch } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { FormAlert } from '@/features/auth/form-parts'
import { cn } from '@/lib/utils'

import { ExerciseDialog } from './exercise-dialog'
import { ExerciseRow } from './exercise-row'
import { groupByMuscle } from './format'
import { fieldsOf, type Draft, type DraftAction, type DraftExercise } from './import-draft'
import { useWorkoutLabels } from './labels'
import { MoveDialog } from './move-dialog'

type ImportReviewProps = {
  draft: Draft
  dispatch: Dispatch<DraftAction>
  saving: boolean
  /** Translation key of a failed save, if any. */
  errorKey: string | undefined
  onConfirm: () => void
  onCancel: () => void
}

type Editing = { exercise: DraftExercise | null } | null

/** Day-by-day review of what the parser understood (design: "Rever importação"). */
export function ImportReview({ draft, dispatch, saving, errorKey, onConfirm, onCancel }: ImportReviewProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const nameId = useId()
  const [current, setCurrent] = useState(0)
  const [editing, setEditing] = useState<Editing>(null)
  const [moving, setMoving] = useState<DraftExercise | null>(null)

  const day = draft.days[current]
  const isLast = current === draft.days.length - 1
  const groups = groupByMuscle(day.exercises)
  const nameMissing = draft.name.trim() === ''

  const confirmDay = () => {
    dispatch({ type: 'mark-reviewed', day: day.key })
    if (isLast) onConfirm()
    else setCurrent(current + 1)
  }

  return (
    <div className="grid gap-5">
      <Field data-invalid={nameMissing}>
        <FieldLabel htmlFor={nameId}>{t('import.review.planName')}</FieldLabel>
        <Input
          id={nameId}
          value={draft.name}
          maxLength={120}
          aria-invalid={nameMissing}
          onChange={(event) => dispatch({ type: 'rename-plan', name: event.target.value })}
        />
      </Field>

      <nav aria-label={t('import.review.days')} className="-mx-5 overflow-x-auto px-5">
        {/* Equal columns filling the row; never narrower than a 44px touch target (scrolls instead). */}
        <ul className="grid auto-cols-[minmax(2.75rem,1fr)] grid-flow-col gap-1.5 py-px">
          {draft.days.map((item, index) => (
            <li key={item.key}>
              <button
                type="button"
                aria-pressed={index === current}
                onClick={() => setCurrent(index)}
                className={cn(
                  'flex h-11 w-full items-center justify-center gap-1 rounded-lg bg-card px-1 text-sm text-muted-foreground',
                  index === current && 'bg-accent text-foreground ring-1 ring-primary',
                )}
              >
                {labels.weekdayShort(item.weekday)}
                {item.reviewed && (
                  <CheckIcon className="size-3.5 text-primary" aria-label={t('import.review.reviewed')} />
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby={`${nameId}-day`} className="grid gap-4">
        <header>
          <p className="text-xs tracking-widest text-muted-foreground uppercase">
            {t('import.review.kicker', { current: current + 1, total: draft.days.length })}
          </p>
          <h2 id={`${nameId}-day`} className="text-lg">
            {day.label ? `${labels.weekdayLong(day.weekday)} — ${day.label}` : labels.weekdayLong(day.weekday)}
          </h2>
        </header>

        {groups.map(({ group, exercises }) => (
          <div key={group ?? 'none'} className="grid gap-1.5">
            <h3 className="px-0.5 text-xs tracking-widest text-primary uppercase">{labels.group(group)}</h3>
            <ul className="grid gap-1.5">
              {exercises.map((exercise, index) => (
                <ExerciseRow
                  key={exercise.key}
                  exercise={exercise}
                  canMoveUp={index > 0}
                  canMoveDown={index < exercises.length - 1}
                  onEdit={() => setEditing({ exercise })}
                  onMove={() => setMoving(exercise)}
                  onShift={(direction) =>
                    dispatch({ type: 'shift-exercise', day: day.key, exercise: exercise.key, direction })
                  }
                  onDelete={() => dispatch({ type: 'delete-exercise', day: day.key, exercise: exercise.key })}
                />
              ))}
            </ul>
          </div>
        ))}

        {day.exercises.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('import.review.emptyDay')}</p>
        )}

        <Button
          variant="outline"
          size="touch"
          className="border-dashed text-muted-foreground"
          onClick={() => setEditing({ exercise: null })}
        >
          <PlusIcon />
          {t('import.review.addExercise')}
        </Button>
      </section>

      <FormAlert messageKey={errorKey} />

      <div className="grid gap-2">
        {isLast ? (
          <Button size="hero" onClick={confirmDay} disabled={saving || nameMissing}>
            {saving ? (
              <>
                <Spinner />
                {t('import.review.saving')}
              </>
            ) : (
              t('import.review.confirmActivate')
            )}
          </Button>
        ) : (
          <Button size="hero" onClick={confirmDay} disabled={saving}>
            {t('import.review.confirmDay')}
            <CaretRightIcon />
          </Button>
        )}
        {!isLast && (
          <Button variant="ghost" size="touch" onClick={onConfirm} disabled={saving || nameMissing}>
            {t('import.review.confirmAll')}
          </Button>
        )}
        <Button variant="ghost" size="touch" className="text-muted-foreground" onClick={onCancel} disabled={saving}>
          {t('import.review.cancel')}
        </Button>
      </div>

      <ExerciseDialog
        open={editing !== null}
        exercise={editing?.exercise ? fieldsOf(editing.exercise) : null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(fields) => {
          if (editing?.exercise) {
            dispatch({ type: 'update-exercise', day: day.key, exercise: editing.exercise.key, fields })
          } else {
            dispatch({ type: 'add-exercise', day: day.key, fields })
          }
          setEditing(null)
        }}
      />
      <MoveDialog
        open={moving !== null}
        exercise={moving}
        currentDay={day.key}
        days={draft.days}
        onOpenChange={(open) => !open && setMoving(null)}
        onMove={({ day: toDay, group }) => {
          if (moving) {
            dispatch({ type: 'move-exercise', day: day.key, exercise: moving.key, toDay, toGroup: group })
          }
          setMoving(null)
        }}
      />
    </div>
  )
}
