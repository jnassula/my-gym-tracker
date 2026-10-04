import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'

import { login } from './api'
import { CheckEmail } from './check-email'
import { errorKey } from './errors'
import { PasswordField, TextField } from './form-fields'
import { FormAlert, SubmitButton } from './form-parts'
import { loginSchema, type LoginValues } from './schemas'

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation()
  const rememberId = useId()
  // The address of an account that hasn't confirmed its email yet (said after the right password).
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: true },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setUnconfirmed(null)
    try {
      await login(values)
      onSuccess()
    } catch (error) {
      const key = errorKey(error)
      // The design shows wrong credentials inline, under the password.
      if (key === 'errors.invalid_credentials') form.setError('password', { message: key })
      else if (key === 'errors.email_not_verified') setUnconfirmed(values.email.trim().toLowerCase())
      else form.setError('root', { message: key })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3.5">
      <TextField
        control={form.control}
        name="email"
        label={t('auth.email')}
        type="email"
        inputMode="email"
        autoComplete="email"
      />
      <PasswordField
        control={form.control}
        name="password"
        label={t('auth.password')}
        autoComplete="current-password"
      />
      <div className="flex min-h-11 items-center justify-between gap-4">
        <Controller
          control={form.control}
          name="remember"
          render={({ field }) => (
            <Field orientation="horizontal" className="w-auto">
              <Checkbox
                id={rememberId}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              <FieldLabel htmlFor={rememberId} className="font-normal">
                {t('auth.login.remember')}
              </FieldLabel>
            </Field>
          )}
        />
        <Link to="/forgot-password" className="py-3 text-sm text-primary">
          {t('auth.login.forgot')}
        </Link>
      </div>
      <FormAlert messageKey={form.formState.errors.root?.message} />
      <SubmitButton pending={form.formState.isSubmitting} pendingLabel={t('auth.login.submitting')}>
        {t('auth.login.submit')}
      </SubmitButton>
      {unconfirmed && <CheckEmail email={unconfirmed} />}
    </form>
  )
}
