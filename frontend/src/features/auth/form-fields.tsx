import { useId, useState, type ComponentProps } from 'react'
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'

import { fieldMessage } from './errors'
import { PasswordStrengthMeter } from './password-strength-meter'

type BaseProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
}

type TextFieldProps<T extends FieldValues> = BaseProps<T> &
  Pick<ComponentProps<'input'>, 'type' | 'autoComplete' | 'inputMode' | 'autoFocus'>

export function TextField<T extends FieldValues>({ control, name, label, ...input }: TextFieldProps<T>) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            {...field}
            {...input}
            id={id}
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.error ? `${id}-error` : undefined}
          />
          <FieldError id={`${id}-error`}>{fieldMessage(t, fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  )
}

type PasswordFieldProps<T extends FieldValues> = BaseProps<T> & {
  autoComplete: 'current-password' | 'new-password'
  /** Show the strength meter under the input (new passwords). */
  showStrength?: boolean
}

export function PasswordField<T extends FieldValues>({
  control,
  name,
  label,
  autoComplete,
  showStrength = false,
}: PasswordFieldProps<T>) {
  const { t } = useTranslation()
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              {...field}
              id={id}
              type={visible ? 'text' : 'password'}
              autoComplete={autoComplete}
              aria-invalid={fieldState.invalid}
              aria-describedby={
                [fieldState.error && `${id}-error`, showStrength && `${id}-strength`]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="sm"
                className="h-11 text-xs font-normal text-muted-foreground"
                aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
                aria-pressed={visible}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? t('auth.hide') : t('auth.show')}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {showStrength && <PasswordStrengthMeter id={`${id}-strength`} password={String(field.value ?? '')} />}
          <FieldError id={`${id}-error`}>{fieldMessage(t, fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  )
}
