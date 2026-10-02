import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { useWorkoutLabels } from './labels'
import { MUSCLE_GROUPS, type MuscleGroup, type Weekday } from './types'

type Target = { day: string; group: MuscleGroup | null }

type MoveDialogProps = {
  open: boolean
  exercise: { key: string; muscle_group: MuscleGroup | null } | null
  currentDay: string
  days: Array<{ key: string; weekday: Weekday | null }>
  onOpenChange: (open: boolean) => void
  onMove: (target: Target) => void
}

/** "Mover para…": pick another day and/or muscle group (the design's drag, made accessible). */
export function MoveDialog({ open, exercise, currentDay, days, onOpenChange, onMove }: MoveDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('exercise.moveTitle')}</DialogTitle>
        </DialogHeader>
        {open && exercise && (
          <MoveForm
            key={exercise.key}
            initial={{ day: currentDay, group: exercise.muscle_group }}
            days={days}
            onCancel={() => onOpenChange(false)}
            onMove={onMove}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function MoveForm({
  initial,
  days,
  onCancel,
  onMove,
}: {
  initial: Target
  days: Array<{ key: string; weekday: Weekday | null }>
  onCancel: () => void
  onMove: (target: Target) => void
}) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const id = useId()
  const [target, setTarget] = useState(initial)
  const dayItems = days.map((day) => ({ value: day.key, label: labels.weekdayLong(day.weekday) }))
  const groupItems = MUSCLE_GROUPS.map((group) => ({ value: group, label: labels.group(group) }))

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor={`${id}-day`}>{t('exercise.day')}</FieldLabel>
        <Select
          items={dayItems}
          value={target.day}
          onValueChange={(day) => day && setTarget((current) => ({ ...current, day }))}
        >
          <SelectTrigger id={`${id}-day`} className="h-12 w-full bg-card text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dayItems.map((item) => (
              <SelectItem key={item.value} value={item.value} className="min-h-11">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-group`}>{t('exercise.group')}</FieldLabel>
        <Select
          items={groupItems}
          value={target.group}
          onValueChange={(group) => setTarget((current) => ({ ...current, group }))}
        >
          <SelectTrigger id={`${id}-group`} className="h-12 w-full bg-card text-base">
            <SelectValue placeholder={labels.group(null)} />
          </SelectTrigger>
          <SelectContent>
            {groupItems.map((item) => (
              <SelectItem key={item.value} value={item.value} className="min-h-11">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" size="touch" onClick={onCancel}>
          {t('exercise.cancel')}
        </Button>
        <Button type="button" size="touch" onClick={() => onMove(target)}>
          {t('exercise.moveConfirm')}
        </Button>
      </DialogFooter>
    </div>
  )
}
