import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fieldMessage } from '@/features/auth/errors'
import { TextField } from '@/features/auth/form-fields'

import { useWorkoutLabels } from './labels'
import { MUSCLE_GROUPS, type ExerciseFields } from './types'

// Empty inputs mean "not stated in the plan" (null), not zero.
const optionalInt = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= max), 'validation.number')

const schema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(120, 'validation.nameMax'),
  muscle_group: z
    .enum(MUSCLE_GROUPS)
    .nullable()
    // Boolean(): an inferred type predicate would make input and output types differ.
    .refine((group) => Boolean(group), 'validation.required'),
  sets: optionalInt(50),
  reps: z.string().trim().max(32, 'validation.repsMax'),
  rest: optionalInt(3600),
})
type Values = z.infer<typeof schema>

function toValues(fields: ExerciseFields | null): Values {
  return {
    name: fields?.name ?? '',
    muscle_group: fields?.muscle_group ?? null,
    sets: fields?.sets?.toString() ?? '',
    reps: fields?.reps ?? '',
    rest: fields?.rest_seconds?.toString() ?? '',
  }
}

function toFields(values: Values, previous: ExerciseFields | null): ExerciseFields {
  const rest = values.rest === '' ? null : Number(values.rest)
  const keepMax = rest !== null && rest === previous?.rest_seconds ? previous.rest_max_seconds : null
  return {
    name: values.name,
    muscle_group: values.muscle_group,
    sets: values.sets === '' ? null : Number(values.sets),
    reps: values.reps === '' ? null : values.reps,
    rest_seconds: rest,
    rest_max_seconds: keepMax,
    notes: previous?.notes ?? null,
  }
}

type ExerciseDialogProps = {
  open: boolean
  /** null = adding a new exercise. */
  exercise: ExerciseFields | null
  onOpenChange: (open: boolean) => void
  onSave: (fields: ExerciseFields) => void
}

export function ExerciseDialog({ open, exercise, onOpenChange, onSave }: ExerciseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto">
        {/* Remount per opening so the form starts from the exercise being edited. */}
        {open && <ExerciseForm exercise={exercise} onCancel={() => onOpenChange(false)} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  )
}

function ExerciseForm({
  exercise,
  onCancel,
  onSave,
}: {
  exercise: ExerciseFields | null
  onCancel: () => void
  onSave: (fields: ExerciseFields) => void
}) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const groupId = useId()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(exercise) })
  const items = MUSCLE_GROUPS.map((group) => ({ value: group, label: labels.group(group) }))

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={form.handleSubmit((values) => onSave(toFields(values, exercise)))}
    >
      <DialogHeader>
        <DialogTitle>{exercise ? t('exercise.editTitle') : t('exercise.addTitle')}</DialogTitle>
        {exercise?.notes && (
          <DialogDescription>
            {t('exercise.notes')}: {exercise.notes}
          </DialogDescription>
        )}
      </DialogHeader>

      <TextField control={form.control} name="name" label={t('exercise.name')} />

      <Controller
        control={form.control}
        name="muscle_group"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={groupId}>{t('exercise.group')}</FieldLabel>
            <Select items={items} value={field.value ?? null} onValueChange={(value) => field.onChange(value)}>
              <SelectTrigger id={groupId} className="h-12 w-full bg-card text-base" aria-invalid={fieldState.invalid}>
                <SelectValue placeholder={labels.group(null)} />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="min-h-11">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{fieldMessage(t, fieldState.error?.message)}</FieldError>
          </Field>
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField control={form.control} name="sets" label={t('exercise.sets')} inputMode="numeric" />
        <TextField control={form.control} name="rest" label={t('exercise.rest')} inputMode="numeric" />
      </div>
      <Controller
        control={form.control}
        name="reps"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${groupId}-reps`}>{t('exercise.reps')}</FieldLabel>
            <Input {...field} id={`${groupId}-reps`} aria-invalid={fieldState.invalid} />
            <FieldDescription>{t('exercise.repsHint')}</FieldDescription>
            <FieldError>{fieldMessage(t, fieldState.error?.message)}</FieldError>
          </Field>
        )}
      />

      <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" size="touch" onClick={onCancel}>
          {t('exercise.cancel')}
        </Button>
        <Button type="submit" size="touch">
          {t('exercise.save')}
        </Button>
      </DialogFooter>
    </form>
  )
}
