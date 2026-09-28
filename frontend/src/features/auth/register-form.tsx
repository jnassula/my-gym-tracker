import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { isLanguage } from '@/i18n'

import { browserTimezone, register } from './api'
import { errorKey } from './errors'
import { PasswordField, TextField } from './form-fields'
import { FormAlert, SubmitButton } from './form-parts'
import { registerSchema, type RegisterValues } from './schemas'

export function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const { t, i18n } = useTranslation()
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await register({
        ...values,
        language: isLanguage(i18n.language) ? i18n.language : 'pt',
        timezone: browserTimezone(),
      })
      onSuccess()
    } catch (error) {
      const key = errorKey(error)
      if (key === 'errors.email_taken') form.setError('email', { message: key })
      else form.setError('root', { message: key })
    }
  })

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
