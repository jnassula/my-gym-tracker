import {
  ArrowDownIcon,
  ArrowsLeftRightIcon,
  ArrowUpIcon,
  DotsThreeVerticalIcon,
  PencilSimpleIcon,
  TrashIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import type { DraftExercise } from './import-draft'
import { useWorkoutLabels } from './labels'

type ExerciseRowProps = {
  exercise: DraftExercise
  canMoveUp: boolean
  canMoveDown: boolean
  onEdit: () => void
  onMove: () => void
  onShift: (direction: -1 | 1) => void
  onDelete: () => void
}

/** One exercise in the import review: tap to edit, ⋯ for the other actions. */
export function ExerciseRow({
  exercise,
  canMoveUp,
  canMoveDown,
  onEdit,
  onMove,
  onShift,
  onDelete,
}: ExerciseRowProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const flagged = exercise.warnings.length > 0
  const scheme = labels.scheme(exercise)

  return (
    <li
      className={cn(
        'flex min-h-14 items-center gap-1 rounded-xl bg-card py-1 pl-3',
        flagged && 'ring-1 ring-warning/60',
      )}
    >
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 py-1.5 text-left">
        <span className="block text-sm font-medium">{exercise.name}</span>
        {scheme && <span className="block text-xs text-muted-foreground">{scheme}</span>}
        {exercise.warnings.map((warning) => (
          <span key={warning} className="flex items-center gap-1 text-xs text-warning">
            <WarningIcon className="size-3.5 shrink-0" />
            {t(`import.warnings.${warning}`)}
          </span>
        ))}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label={t('exercise.actions', { name: exercise.name })}
            />
          }
        >
          <DotsThreeVerticalIcon className="size-5" weight="bold" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem className="min-h-11" onClick={onEdit}>
            <PencilSimpleIcon />
            {t('exercise.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onClick={onMove}>
            <ArrowsLeftRightIcon />
            {t('exercise.move')}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" disabled={!canMoveUp} onClick={() => onShift(-1)}>
            <ArrowUpIcon />
            {t('exercise.moveUp')}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" disabled={!canMoveDown} onClick={() => onShift(1)}>
            <ArrowDownIcon />
            {t('exercise.moveDown')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11" variant="destructive" onClick={onDelete}>
            <TrashIcon />
            {t('exercise.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
