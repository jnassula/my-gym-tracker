import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { localNow } from '@/features/home/home'
import { formatNumber, parseWeight, toKg, toUnit, type Unit } from '@/features/training/weight'

import { useAddMeasurement } from './api'

/** What the API takes, in kg and percent. */
const WEIGHT_KG = [10, 300] as const
const BODY_FAT = [2, 75] as const
const EARLIEST_DAY = '2000-01-01'

type AddMeasurementDialogProps = { open: boolean; unit: Unit; timeZone: string; onClose: () => void }

/** A weighing typed in: the weight, its day and, for a scale that shows it, the body fat. */
export function AddMeasurementDialog({ open, unit, timeZone, onClose }: AddMeasurementDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent showCloseButton={false}>
        {open && <MeasurementForm unit={unit} timeZone={timeZone} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function MeasurementForm({ unit, timeZone, onClose }: Omit<AddMeasurementDialogProps, 'open'>) {
  const { t, i18n } = useTranslation()
  const ids = { weight: useId(), day: useId(), fat: useId(), fatHint: useId() }
  const [today] = useState(() => localNow(timeZone, new Date()).date)
  const [weight, setWeight] = useState('')
  const [day, setDay] = useState(today)
  const [fat, setFat] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const add = useAddMeasurement()

  const [min, max] = WEIGHT_KG.map((kg) => toUnit(kg, unit))
  const parsedWeight = parseWeight(weight)
  const weightValid = parsedWeight !== null && parsedWeight >= min && parsedWeight <= max
  const parsedFat = fat.trim() === '' ? null : Number(fat.trim().replace(',', '.'))
  const fatValid =
    parsedFat === null ||
    (/^\d{1,2}([.,]\d)?$/.test(fat.trim()) && parsedFat >= BODY_FAT[0] && parsedFat <= BODY_FAT[1])
  const dayValid = day >= EARLIEST_DAY && day <= today

  function save() {
    setSubmitted(true)
    if (!weightValid || !fatValid || !dayValid || parsedWeight === null) return
    add.mutate(
      {
        source: 'manual',
        weight: toKg(parsedWeight, unit),
        // Today is "now" on the server; an earlier day is dated at its noon.
        ...(day !== today && { day }),
        ...(parsedFat !== null && { body_fat_pct: parsedFat }),
      },
      {
        onSuccess: () => {
          toast.success(t('body.manual.saved'))
          onClose()
        },
      },
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
        <DialogTitle>{t('body.manual.title')}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field data-invalid={submitted && !weightValid}>
          <FieldLabel htmlFor={ids.weight}>{t('body.manual.weight', { unit })}</FieldLabel>
          <Input
            id={ids.weight}
            inputMode="decimal"
            autoFocus
            value={weight}
            aria-invalid={submitted && !weightValid}
            onChange={(event) => setWeight(event.target.value)}
          />
          {submitted && !weightValid && (
            <FieldError>
              {t('body.manual.invalidWeight', {
                min: formatNumber(min, i18n.language),
                max: formatNumber(max, i18n.language),
                unit,
              })}
            </FieldError>
          )}
        </Field>
        <Field data-invalid={submitted && !dayValid}>
          <FieldLabel htmlFor={ids.day}>{t('body.manual.date')}</FieldLabel>
          <Input
            id={ids.day}
            type="date"
            min={EARLIEST_DAY}
            max={today}
            value={day}
            aria-invalid={submitted && !dayValid}
            onChange={(event) => setDay(event.target.value)}
          />
          {submitted && !dayValid && <FieldError>{t('body.manual.invalidDate')}</FieldError>}
        </Field>
      </div>
      <Field data-invalid={submitted && !fatValid}>
        <FieldLabel htmlFor={ids.fat}>{t('body.manual.bodyFat')}</FieldLabel>
        <Input
          id={ids.fat}
          inputMode="decimal"
          value={fat}
          aria-invalid={submitted && !fatValid}
          aria-describedby={ids.fatHint}
          onChange={(event) => setFat(event.target.value)}
        />
        {submitted && !fatValid ? (
          <FieldError>{t('body.manual.invalidFat')}</FieldError>
        ) : (
          <FieldDescription id={ids.fatHint}>{t('body.manual.bodyFatHint')}</FieldDescription>
        )}
      </Field>
      {add.error && <FormAlert messageKey={errorKey(add.error)} />}
      <DialogFooter className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="touch" onClick={onClose}>
          {t('body.list.cancel')}
        </Button>
        <Button type="submit" variant="outline-primary" size="touch" disabled={add.isPending}>
          {t('body.manual.save')}
        </Button>
      </DialogFooter>
    </form>
  )
}
