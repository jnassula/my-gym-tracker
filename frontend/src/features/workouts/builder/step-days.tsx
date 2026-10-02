import { CaretRightIcon, CopyIcon, DotsThreeIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { useState, type Dispatch } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { ExerciseRow } from '../exercise-row'
import { useWorkoutLabels } from '../labels'
import { MoveDialog } from '../move-dialog'
import { MUSCLE_GROUPS, type MuscleGroup } from '../types'
import { ConfirmDialog, type Confirmation } from './confirm-dialog'
import { groupsOf, type BuilderAction, type BuilderDraft, type BuilderExercise } from './draft'
import { ExerciseSheet } from './exercise-sheet'

type StepDaysProps = {
  draft: BuilderDraft
  dispatch: Dispatch<BuilderAction>
  /** Index into `draft.days` of the day on screen. */
  dayIndex: number
  onDayChange: (index: number) => void
  onReview: () => void
}

type Editing = { group: MuscleGroup; exercise: BuilderExercise | null } | null

/** Step 2: one day at a time, its group cards and their exercises. */
export function StepDays({ draft, dispatch, dayIndex, onDayChange, onReview }: StepDaysProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const [editing, setEditing] = useState<Editing>(null)
  const [moving, setMoving] = useState<BuilderExercise | null>(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  const day = draft.days[Math.min(dayIndex, draft.days.length - 1)]
  const cards = groupsOf(day)
  const others = draft.days.filter((item) => item.key !== day.key)
  const missingGroups = MUSCLE_GROUPS.filter((group) => !day.groups.includes(group))

  const removeGroup = (group: MuscleGroup, count: number) => {
    const action = () => dispatch({ type: 'remove-group', day: day.key, group })
    if (count === 0) action()
    else {
      setConfirmation({
        title: t('builder.days.removeGroupTitle', { group: labels.group(group) }),
        body: t('builder.days.removeGroupBody', { count }),
        confirmLabel: t('builder.days.removeGroup'),
        onConfirm: action,
      })
    }
  }

  const copyTo = (target: (typeof draft.days)[number]) => {
    const action = () => dispatch({ type: 'copy-day', day: day.key, toDay: target.key })
    if (target.exercises.length === 0) action()
    else {
      setConfirmation({
        title: t('builder.days.copyOverTitle', { day: labels.weekdayLong(target.weekday) }),
        body: t('builder.days.copyOverBody', { count: target.exercises.length }),
        confirmLabel: t('builder.days.copyOver'),
        onConfirm: action,
      })
    }
  }

  const schemeOf = (exercise: BuilderExercise) => {
    const scheme = labels.scheme(exercise)
    if (exercise.techniques.length === 0) return scheme
    const techniques = exercise.techniques.map((item) => t(`builder.exercise.techniques.${item}`)).join(', ')
    return t('builder.exercise.withTechniques', { scheme, techniques })
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2">
        <nav aria-label={t('import.review.days')} className="min-w-0 flex-1 overflow-x-auto">
          <ul className="grid auto-cols-[minmax(2.75rem,1fr)] grid-flow-col gap-1.5 py-px">
            {draft.days.map((item, index) => (
              <li key={item.key}>
                <button
                  type="button"
                  aria-pressed={item.key === day.key}
                  aria-label={labels.weekdayLong(item.weekday)}
                  onClick={() => onDayChange(index)}
                  className={cn(
                    'flex h-11 w-full flex-col items-center justify-center rounded-lg bg-card px-1 text-sm text-muted-foreground',
                    item.key === day.key && 'bg-accent text-foreground ring-1 ring-primary',
                  )}
                >
                  <span className="leading-none">{labels.weekdayShort(item.weekday)}</span>
                  <span className="text-[0.6875rem] leading-tight tabular-nums">
                    {item.exercises.length > 0 ? item.exercises.length : '·'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {others.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-touch" aria-label={t('builder.days.copyTo')} />}
            >
              <CopyIcon className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {others.map((item) => (
                <DropdownMenuItem key={item.key} className="min-h-11" onClick={() => copyTo(item)}>
                  {t('builder.days.copyToDay', { day: labels.weekdayLong(item.weekday) })}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <section aria-label={labels.weekdayLong(day.weekday)} className="grid gap-3">
        {cards.map(({ group, exercises }) => (
          <div key={group} className="grid gap-1.5 rounded-2xl bg-card/60 p-2 ring-1 ring-border">
            <div className="flex items-center gap-1 pl-1.5">
              <h3 className="min-w-0 flex-1 truncate text-xs tracking-widest text-primary uppercase">
                {labels.group(group)}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-primary"
                aria-label={t('builder.days.addExerciseLabel', { group: labels.group(group) })}
                onClick={() => setEditing({ group, exercise: null })}
              >
                <PlusIcon />
                {t('builder.days.addExercise')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-touch"
                      className="size-9"
                      aria-label={t('builder.days.groupActions', { group: labels.group(group) })}
                    />
                  }
                >
                  <DotsThreeIcon className="size-5" weight="bold" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuItem
                    className="min-h-11"
                    variant="destructive"
                    onClick={() => removeGroup(group, exercises.length)}
                  >
                    <TrashIcon />
                    {t('builder.days.removeGroup')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {exercises.length === 0 ? (
              <p className="px-1.5 pb-1 text-xs text-muted-foreground">{t('builder.days.emptyGroup')}</p>
            ) : (
              <ul className="grid gap-1.5">
                {exercises.map((exercise, index) => (
                  <ExerciseRow
                    key={exercise.key}
                    exercise={exercise}
                    scheme={schemeOf(exercise)}
                    canMoveUp={index > 0}
                    canMoveDown={index < exercises.length - 1}
                    onEdit={() => setEditing({ group, exercise })}
                    onMove={() => setMoving(exercise)}
                    onShift={(direction) =>
                      dispatch({ type: 'shift-exercise', day: day.key, exercise: exercise.key, direction })
                    }
                    onDelete={() => dispatch({ type: 'delete-exercise', day: day.key, exercise: exercise.key })}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}

        {cards.length === 0 && <p className="text-sm text-muted-foreground">{t('builder.days.empty')}</p>}

        <Button
          variant="outline"
          size="touch"
          className="border-dashed text-muted-foreground"
          disabled={missingGroups.length === 0}
          onClick={() => setAddingGroup(true)}
        >
          <PlusIcon />
          {t('builder.days.addGroup')}
        </Button>
      </section>

      <Button size="hero" onClick={onReview}>
        {t('builder.days.review')}
        <CaretRightIcon />
      </Button>

      <Sheet open={addingGroup} onOpenChange={setAddingGroup}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="mx-auto max-w-md gap-4 rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
        >
          <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
          <SheetTitle className="text-lg">{t('builder.days.addGroupTitle')}</SheetTitle>
          <ul className="flex flex-wrap gap-2">
            {missingGroups.map((group) => (
              <li key={group}>
                <Button
                  variant="outline"
                  size="touch"
                  className="h-11 rounded-full px-4"
                  onClick={() => {
                    dispatch({ type: 'add-group', day: day.key, group })
                    setAddingGroup(false)
                  }}
                >
                  {labels.group(group)}
                </Button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <ExerciseSheet
        open={editing !== null}
        group={editing?.group ?? 'other'}
        exercise={editing?.exercise ?? null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(exercise) => {
          if (editing?.exercise) dispatch({ type: 'update-exercise', day: day.key, exercise })
          else dispatch({ type: 'add-exercise', day: day.key, exercise })
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
            dispatch({
              type: 'move-exercise',
              day: day.key,
              exercise: moving.key,
              toDay,
              toGroup: group ?? moving.muscle_group ?? 'other',
            })
          }
          setMoving(null)
        }}
      />

      <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </div>
  )
}
