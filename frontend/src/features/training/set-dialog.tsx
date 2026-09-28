import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'

import { useDeleteSet, useUpdateSet } from './api'
import type { LoggedSet } from './types'
import { formatNumber, parseWeight, toKg, toUnit, type Unit } from './weight'

type SetDialogProps = {
  dayId: string
  /** The set being corrected; null closes the dialog. */
  set: LoggedSet | null
  unit: Unit
  onClose: () => void
}

/** Correct a logged set's weight or reps, or delete it (sets after it are renumbered). */
export function SetDialog({ dayId, set, unit, onClose }: SetDialogProps) {
  return (
    <Dialog open={set !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        {set && <SetForm key={set.id} dayId={dayId} set={set} unit={unit} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function SetForm({ dayId, set, unit, onClose }: SetDialogProps & { set: LoggedSet }) {
  const { t, i18n } = useTranslation()
  const ids = { weight: useId(), reps: useId() }
  const [weight, setWeight] = useState(formatNumber(toUnit(set.weight, unit), i18n.language))
  const [reps, setReps] = useState(String(set.reps))
  const [submitted, setSubmitted] = useState(false)
  const update = useUpdateSet(dayId)
  const remove = useDeleteSet(dayId)

  const maxWeight = toUnit(1000, unit)
  const parsedWeight = parseWeight(weight)
  const weightValid = parsedWeight !== null && parsedWeight <= maxWeight
  const repsValid = /^\d{1,3}$/.test(reps.trim()) && Number(reps) >= 1 && Number(reps) <= 200
  const error = update.error ?? remove.error

  function save() {
    setSubmitted(true)
    if (!weightValid || !repsValid || parsedWeight === null) return
    update.mutate(
      { setId: set.id, weight: toKg(parsedWeight, unit), reps: Number(reps) },
      { onSuccess: onClose },
    )
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('training.edit.title', { n: set.set_number })}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field data-invalid={submitted && !weightValid}>
          <FieldLabel htmlFor={ids.weight}>{t('training.edit.weight', { unit })}</FieldLabel>
          <Input
            id={ids.weight}
            inputMode="decimal"
            value={weight}
            aria-invalid={submitted && !weightValid}
            onChange={(event) => setWeight(event.target.value)}
          />
          {submitted && !weightValid && (
            <FieldError>
              {t('training.edit.invalidWeight', { max: formatNumber(maxWeight, i18n.language) })}
            </FieldError>
          )}
        </Field>
        <Field data-invalid={submitted && !repsValid}>
          <FieldLabel htmlFor={ids.reps}>{t('training.edit.reps')}</FieldLabel>
          <Input
            id={ids.reps}
            inputMode="numeric"
            value={reps}
            aria-invalid={submitted && !repsValid}
            onChange={(event) => setReps(event.target.value)}
          />
          {submitted && !repsValid && <FieldError>{t('training.edit.invalidReps')}</FieldError>}
        </Field>
      </div>
      {error && <FormAlert messageKey={errorKey(error)} />}
      <DialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-1">
        <Button type="submit" variant="outline-primary" size="touch" disabled={update.isPending}>
          {t('training.edit.save')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="touch"
          disabled={remove.isPending}
          onClick={() => remove.mutate(set.id, { onSuccess: onClose })}
        >
          {t('training.edit.delete')}
        </Button>
        <Button type="button" variant="ghost" size="touch" onClick={onClose}>
          {t('training.edit.cancel')}
        </Button>
      </DialogFooter>
    </form>
  )
}
