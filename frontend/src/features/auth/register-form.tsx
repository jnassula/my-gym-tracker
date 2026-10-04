import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { isLanguage } from '@/i18n'

import { browserTimezone, signUp } from './api'
import { CheckEmail } from './check-email'
import { errorKey } from './errors'
import { PasswordField, TextField } from './form-fields'
import { FormAlert, SubmitButton } from './form-parts'
import { registerSchema, type RegisterValues } from './schemas'

/** Sign-up. The account opens with the link sent to the address, so what follows the form is
 * "confirm your email", whatever the address was (the server tells nobody which have accounts). */
export function RegisterForm() {
  const { t, i18n } = useTranslation()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await signUp({
        ...values,
        language: isLanguage(i18n.language) ? i18n.language : 'pt',
        timezone: browserTimezone(),
      })
      setSentTo(values.email.trim().toLowerCase())
    } catch (error) {
      form.setError('root', { message: errorKey(error) })
    }
  })

  if (sentTo) return <CheckEmail email={sentTo} />

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3.5">
      <TextField control={form.control} name="name" label={t('auth.name')} autoComplete="name" />
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
        autoComplete="new-password"
        showStrength
      />
      <FormAlert messageKey={form.formState.errors.root?.message} />
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel={t('auth.register.submitting')}
        className="mt-1"
      >
        {t('auth.register.submit')}
      </SubmitButton>
    </form>
  )
}
