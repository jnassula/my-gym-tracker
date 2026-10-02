import { CaretRightIcon } from '@phosphor-icons/react'
import { useId, useState, type Dispatch } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Segmented } from '@/features/settings/rows'
import { cn } from '@/lib/utils'

import { useWorkoutLabels } from '../labels'
import { WEEKDAYS, type PlanSummary, type Weekday } from '../types'
import { ConfirmDialog, type Confirmation } from './confirm-dialog'
import type { BuilderAction, BuilderDraft } from './draft'
import { TEMPLATES, type Template } from './templates'

/** How step 2 starts: no cards, another plan's groups per day, or a classic split. */
export type StructureChoice =
  | { kind: 'empty' }
  | { kind: 'plan'; planId: string }
  | { kind: 'template'; template: Template }

type StepNameProps = {
  draft: BuilderDraft
  dispatch: Dispatch<BuilderAction>
  plans: PlanSummary[]
  pending: boolean
  onContinue: (structure: StructureChoice) => void
}

/** Step 1: name, training days, how to start and the optional "trocar até". */
export function StepName({ draft, dispatch, plans, pending, onContinue }: StepNameProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const id = useId()
  const [choice, setChoice] = useState<StructureChoice>({ kind: 'empty' })
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [touched, setTouched] = useState(false)

  const weekdays = draft.days.map((day) => String(day.weekday))
  const nameMissing = draft.name.trim() === ''
  const noDays = draft.days.length === 0
  const defaultPlan = plans.find((plan) => plan.is_active) ?? plans[0]
  const chosenPlan = choice.kind === 'plan' ? plans.find((plan) => plan.id === choice.planId) : undefined
  const template = choice.kind === 'template' ? choice.template : 'fullbody'

  const toggle = (weekday: Weekday) => {
    const day = draft.days.find((item) => item.weekday === weekday)
    if (day && day.exercises.length > 0) {
      setConfirmation({
        title: t('builder.name.removeDayTitle', { day: labels.weekdayLong(weekday) }),
        body: t('builder.name.removeDayBody', { count: day.exercises.length }),
        confirmLabel: t('builder.name.removeDay'),
        onConfirm: () => dispatch({ type: 'toggle-weekday', weekday }),
      })
    } else {
      dispatch({ type: 'toggle-weekday', weekday })
    }
  }

  const submit = () => {
    setTouched(true)
    if (nameMissing || noDays) return
    onContinue(choice)
  }

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Field data-invalid={touched && nameMissing}>
        <FieldLabel htmlFor={`${id}-name`}>{t('builder.name.label')}</FieldLabel>
        <Input
          id={`${id}-name`}
          value={draft.name}
          maxLength={120}
          placeholder={t('builder.name.placeholder')}
          autoComplete="off"
          aria-invalid={touched && nameMissing}
          onChange={(event) => dispatch({ type: 'rename', name: event.target.value })}
        />
        {touched && nameMissing && (
          <p role="alert" className="text-sm text-destructive">
            {t('validation.required')}
          </p>
        )}
      </Field>

      <Field data-invalid={touched && noDays}>
        <div className="flex items-baseline justify-between">
          <FieldLabel>{t('builder.name.days')}</FieldLabel>
          <span className="text-sm text-muted-foreground">
            {t('builder.name.daysCount', { count: draft.days.length })}
          </span>
        </div>
        <ToggleGroup
          multiple
          value={weekdays}
          // Base UI gives the whole selection; the reducer takes one change at a time.
          onValueChange={(next) => {
            const changed = [...weekdays, ...next].find((item) => weekdays.includes(item) !== next.includes(item))
            if (changed !== undefined) toggle(Number(changed) as Weekday)
          }}
          aria-label={t('builder.name.days')}
          spacing={0}
          className="grid w-full grid-cols-7 gap-1.5"
        >
          {WEEKDAYS.map((weekday) => (
            <ToggleGroupItem
              key={weekday}
              value={String(weekday)}
              aria-label={labels.weekdayLong(weekday)}
              className={cn(
                'h-12 w-full rounded-xl bg-card text-sm text-muted-foreground',
                'aria-pressed:bg-primary aria-pressed:text-primary-foreground',
              )}
            >
              {t(`weekdays.initial.${weekday}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {touched && noDays && (
          <p role="alert" className="text-sm text-destructive">
            {t('builder.name.needDays')}
          </p>
        )}
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t('builder.name.structure')}</legend>
        <RadioGroup
          value={choice.kind}
          onValueChange={(kind) => {
            if (kind === 'plan' && defaultPlan) setChoice({ kind, planId: chosenPlan?.id ?? defaultPlan.id })
            else if (kind === 'template') setChoice({ kind, template })
            else setChoice({ kind: 'empty' })
          }}
          className="gap-2"
        >
          <StructureOption
            value="empty"
            title={t('builder.name.empty')}
            hint={t('builder.name.emptyHint')}
            selected={choice.kind === 'empty'}
          />
          {defaultPlan && (
            <StructureOption
              value="plan"
              title={
                plans.length === 1 ? t('builder.name.copy', { name: defaultPlan.name }) : t('builder.name.copyAny')
              }
              hint={t('builder.name.copyHint')}
              selected={choice.kind === 'plan'}
            >
              {plans.length > 1 && (
                <Select
                  items={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
                  value={chosenPlan?.id ?? defaultPlan.id}
                  onValueChange={(planId) => planId && setChoice({ kind: 'plan', planId })}
                >
                  <SelectTrigger className="mt-2 h-11 w-full bg-background" aria-label={t('builder.name.copyWhich')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id} className="min-h-11">
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </StructureOption>
          )}
          <StructureOption
            value="template"
            title={t('builder.name.template')}
            hint={t('builder.name.templateHint')}
            selected={choice.kind === 'template'}
          >
            <div className="mt-2">
              <Segmented
                label={t('builder.name.template')}
                value={template}
                options={TEMPLATES.map((item) => ({ value: item, label: t(`builder.templates.${item}`) }))}
                onChange={(next) => setChoice({ kind: 'template', template: next })}
              />
            </div>
          </StructureOption>
        </RadioGroup>
      </fieldset>

      <Field>
        <FieldLabel htmlFor={`${id}-until`}>{t('builder.name.validUntil')}</FieldLabel>
        <Input
          id={`${id}-until`}
          type="date"
          value={draft.validUntil ?? ''}
          onChange={(event) => dispatch({ type: 'set-valid-until', date: event.target.value || null })}
        />
        <FieldDescription>{t('builder.name.validUntilHint')}</FieldDescription>
      </Field>

      <Button type="submit" size="hero" disabled={pending}>
        {t('builder.name.continue')}
        <CaretRightIcon />
      </Button>

      <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </form>
  )
}

function StructureOption({
  value,
  title,
  hint,
  selected,
  children,
}: {
  value: StructureChoice['kind']
  title: string
  hint: string
  selected: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={cn('rounded-xl bg-card p-3', selected && 'ring-1 ring-primary')}>
      {/* Base UI names the radio after the label around it. */}
      <label className="flex items-start gap-3">
        <RadioGroupItem value={value} className="mt-1" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </label>
      {selected && children && <div className="pl-7">{children}</div>}
    </div>
  )
}
