import { MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

import { clock } from '../format'
import { useWorkoutLabels } from '../labels'
import type { MuscleGroup } from '../types'
import { newExercise, TECHNIQUES, type BuilderExercise, type Technique } from './draft'
import {
  clampRest,
  clampSets,
  isProgression,
  joinReps,
  matchesPreset,
  MAX_REPS_LENGTH,
  PRESETS,
  repsPerSet,
  REST_STEP,
} from './scheme'

const CHIP = 'h-10 rounded-lg px-3 text-[13px] text-muted-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground'

type ExerciseSheetProps = {
  open: boolean
  /** The group card the exercise belongs to. */
  group: MuscleGroup
  /** null = a new exercise in that group. */
  exercise: BuilderExercise | null
  onOpenChange: (open: boolean) => void
  onSave: (exercise: BuilderExercise) => void
}

/** "Configurar exercício": presets, sets and rest steppers, reps per set, techniques, notes. */
export function ExerciseSheet(props: ExerciseSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[92dvh] max-w-md gap-4 overflow-y-auto rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        {/* Remounted per opening, so the form starts from the exercise being edited. */}
        {props.open && <ExerciseForm {...props} />}
      </SheetContent>
    </Sheet>
  )
}

function Stepper({
  label,
  value,
  lessLabel,
  moreLabel,
  onLess,
  onMore,
}: {
  label: string
  value: string
  lessLabel: string
  moreLabel: string
  onLess: () => void
  onMore: () => void
}) {
  return (
    <div className="grid gap-2 rounded-xl bg-background p-3">
      <span className="text-[0.6875rem] tracking-widest text-muted-foreground uppercase">{label}</span>
      <div className="flex items-center justify-between gap-1">
        <Button type="button" variant="outline" size="icon-touch" aria-label={lessLabel} onClick={onLess}>
          <MinusIcon />
        </Button>
        <output className="text-2xl tabular-nums">{value}</output>
        <Button type="button" variant="outline" size="icon-touch" aria-label={moreLabel} onClick={onMore}>
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}

function ExerciseForm({ group, exercise, onOpenChange, onSave }: ExerciseSheetProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const id = useId()
  const [draft, setDraft] = useState<BuilderExercise>(() => exercise ?? newExercise('', group))
  const [progression, setProgression] = useState(isProgression(draft.reps))
  const [touched, setTouched] = useState(false)

  const sets = draft.sets ?? 1
  const rest = draft.rest_seconds ?? 0
  const perSet = repsPerSet(draft.reps, sets)
  const nameMissing = draft.name.trim() === ''
  const preset = PRESETS.find((item) => matchesPreset(draft, item))
  const presetValue = progression ? 'progression' : preset ? `${preset.sets}x${preset.reps}` : ''

  const update = (changes: Partial<BuilderExercise>) => setDraft((current) => ({ ...current, ...changes }))

  const setSets = (next: number) => {
    const count = clampSets(next)
    // A progression keeps one figure per set; a plain scheme just changes the count.
    update({ sets: count, reps: progression ? joinReps(repsPerSet(draft.reps, count)) : draft.reps })
  }

  const choosePreset = (value: string) => {
    if (value === 'progression') {
      setProgression(true)
      return
    }
    const chosen = PRESETS.find((item) => `${item.sets}x${item.reps}` === value)
    if (chosen) {
      setProgression(false)
      update({ sets: chosen.sets, reps: chosen.reps })
    }
  }

  const setRep = (index: number, value: string) => {
    const next = [...perSet]
    next[index] = value
    update({ reps: joinReps(next) })
  }

  const summary = labels.scheme(draft)
  const techniques = draft.techniques.map((item) => t(`builder.exercise.techniques.${item}`)).join(', ')

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setTouched(true)
        if (nameMissing) return
        onSave({ ...draft, name: draft.name.trim(), notes: draft.notes?.trim() || null })
        onOpenChange(false)
      }}
    >
      <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
      <div>
        <p className="text-[0.6875rem] font-medium tracking-widest text-muted-foreground uppercase">
          {labels.group(group)}
        </p>
        <SheetTitle className="text-lg">
          {exercise ? t('builder.exercise.editTitle') : t('builder.exercise.addTitle')}
        </SheetTitle>
      </div>

      <Field data-invalid={touched && nameMissing}>
        <FieldLabel htmlFor={`${id}-name`}>{t('builder.exercise.name')}</FieldLabel>
        <Input
          id={`${id}-name`}
          value={draft.name}
          maxLength={120}
          autoFocus={exercise === null}
          autoComplete="off"
          aria-invalid={touched && nameMissing}
          onChange={(event) => update({ name: event.target.value })}
        />
        {touched && nameMissing && (
          <p role="alert" className="text-sm text-destructive">
            {t('validation.required')}
          </p>
        )}
      </Field>

      <ToggleGroup
        value={presetValue ? [presetValue] : []}
        onValueChange={(value) => value[0] && choosePreset(value[0])}
        aria-label={t('builder.exercise.presets')}
        spacing={0}
        className="grid w-full grid-cols-4 gap-1 rounded-xl bg-background p-1"
      >
        {PRESETS.map((item) => (
          <ToggleGroupItem key={item.sets} value={`${item.sets}x${item.reps}`} className={CHIP}>
            {item.sets}×{item.reps}
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem value="progression" className={CHIP}>
          {t('builder.exercise.progression')}
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label={t('builder.exercise.sets')}
          value={String(sets)}
          lessLabel={t('builder.exercise.fewerSets')}
          moreLabel={t('builder.exercise.moreSets')}
          onLess={() => setSets(sets - 1)}
          onMore={() => setSets(sets + 1)}
        />
        <Stepper
          label={t('builder.exercise.rest')}
          value={clock(rest)}
          lessLabel={t('builder.exercise.lessRest')}
          moreLabel={t('builder.exercise.moreRest')}
          onLess={() => update({ rest_seconds: clampRest(rest - REST_STEP), rest_max_seconds: null })}
          onMore={() => update({ rest_seconds: clampRest(rest + REST_STEP), rest_max_seconds: null })}
        />
      </div>

      {progression ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{t('builder.exercise.repsPerSet')}</legend>
          <div className="grid grid-cols-4 gap-2">
            {perSet.map((value, index) => (
              <Field key={index}>
                <FieldLabel htmlFor={`${id}-set-${index}`} className="text-xs text-muted-foreground">
                  {t('builder.exercise.set', { n: index + 1 })}
                </FieldLabel>
                <Input
                  id={`${id}-set-${index}`}
                  value={value}
                  inputMode="numeric"
                  maxLength={6}
                  className="h-11 px-2 text-center"
                  onChange={(event) => setRep(index, event.target.value)}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ) : (
        <Field>
          <FieldLabel htmlFor={`${id}-reps`}>{t('builder.exercise.reps')}</FieldLabel>
          <Input
            id={`${id}-reps`}
            value={draft.reps ?? ''}
            maxLength={MAX_REPS_LENGTH}
            placeholder={t('exercise.repsHint')}
            onChange={(event) => update({ reps: event.target.value.trim() || null })}
          />
        </Field>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t('builder.exercise.technique')}</legend>
        <ToggleGroup
          multiple
          value={draft.techniques}
          onValueChange={(value) => update({ techniques: value as Technique[] })}
          aria-label={t('builder.exercise.technique')}
          spacing={0}
          className="flex flex-wrap gap-1.5"
        >
          {TECHNIQUES.map((item) => (
            <ToggleGroupItem key={item} value={item} className={cn(CHIP, 'bg-background')}>
              {t(`builder.exercise.techniques.${item}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </fieldset>

      <Field>
        <FieldLabel htmlFor={`${id}-notes`}>{t('builder.exercise.notes')}</FieldLabel>
        <Textarea
          id={`${id}-notes`}
          value={draft.notes ?? ''}
          maxLength={2000}
          placeholder={t('builder.exercise.notesPlaceholder')}
          className="bg-card"
          onChange={(event) => update({ notes: event.target.value || null })}
        />
      </Field>

      <Button type="submit" size="hero">
        {t('builder.exercise.save')}
        {summary && (
          <span className="font-normal opacity-80">
            · {techniques ? t('builder.exercise.withTechniques', { scheme: summary, techniques }) : summary}
          </span>
        )}
      </Button>
    </form>
  )
}
