import { CheckIcon, MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { FormAlert } from '@/features/auth/form-parts'

import { clampWeight, FINE_STEP, formatNumber, type Unit } from './weight'

type Stepped = {
  label: string
  value: string
  lessLabel: string
  moreLabel: string
  onLess: () => void
  onMore: () => void
}

function SteppedValue({ label, value, lessLabel, moreLabel, onLess, onMore }: Stepped) {
  return (
    <div className="grid gap-2 rounded-xl bg-background p-3">
      <span className="text-[0.6875rem] tracking-widest text-muted-foreground uppercase">{label}</span>
      <div className="flex items-center justify-between gap-1">
        <Button variant="outline" size="icon-touch" aria-label={lessLabel} onClick={onLess}>
          <MinusIcon />
        </Button>
        <output className="text-2xl tabular-nums">{value}</output>
        <Button variant="outline" size="icon-touch" aria-label={moreLabel} onClick={onMore}>
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}

type LogSetSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The number this set will get (1-based). */
  number: number
  scheme: string
  unit: Unit
  /** Pre-filled weight in the unit on screen, and reps. */
  weight: number
  reps: number
  pending: boolean
  errorKey: string | null
  onConfirm: (weight: number, reps: number) => void
}

/** "Registar série #n": fine-tune weight (±2.5) and reps (±1), then confirm. */
export function LogSetSheet(props: LogSetSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-md gap-4 rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        {/* Remounted per opening, so it starts from the screen's current weight. */}
        {props.open && <LogSetForm {...props} />}
      </SheetContent>
    </Sheet>
  )
}

function LogSetForm({ number, scheme, unit, pending, errorKey, onConfirm, ...initial }: LogSetSheetProps) {
  const { t, i18n } = useTranslation()
  const [weight, setWeight] = useState(initial.weight)
  const [reps, setReps] = useState(initial.reps)
  return (
    <>
      <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
      <div className="flex items-baseline justify-between gap-3">
        <SheetTitle className="text-lg">{t('training.log.title', { n: number })}</SheetTitle>
        <span className="truncate text-sm text-muted-foreground">{scheme}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SteppedValue
          label={t('training.log.weight')}
          value={`${formatNumber(weight, i18n.language)} ${unit}`}
          lessLabel={t('training.log.lessWeight')}
          moreLabel={t('training.log.moreWeight')}
          onLess={() => setWeight((w) => clampWeight(w - FINE_STEP, unit))}
          onMore={() => setWeight((w) => clampWeight(w + FINE_STEP, unit))}
        />
        <SteppedValue
          label={t('training.log.reps')}
          value={String(reps)}
          lessLabel={t('training.log.lessReps')}
          moreLabel={t('training.log.moreReps')}
          onLess={() => setReps((r) => Math.max(1, r - 1))}
          onMore={() => setReps((r) => Math.min(200, r + 1))}
        />
      </div>
      {errorKey && <FormAlert messageKey={errorKey} />}
      <Button size="hero" disabled={pending} onClick={() => onConfirm(weight, reps)}>
        <CheckIcon weight="bold" />
        {pending ? t('training.log.saving') : t('training.log.confirm')}
      </Button>
    </>
  )
}
