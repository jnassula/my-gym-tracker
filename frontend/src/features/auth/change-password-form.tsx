import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { changePassword } from './api'
import { errorKey } from './errors'
import { PasswordField } from './form-fields'
import { FormAlert, SubmitButton } from './form-parts'
import { changePasswordSchema, type ChangePasswordValues } from './schemas'

export function ChangePasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation()
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  })

  const onSubmit = form.handleSubmit(async ({ current, password }) => {
    try {
      await changePassword(current, password)
      onSuccess()
    } catch (error) {
      const key = errorKey(error)
      if (key === 'errors.invalid_current_password') form.setError('current', { message: key })
      else form.setError('root', { message: key })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3.5">
      <PasswordField
        control={form.control}
        name="current"
        label={t('settings.password.current')}
        autoComplete="current-password"
      />
      <PasswordField
        control={form.control}
        name="password"
        label={t('settings.password.new')}
        autoComplete="new-password"
        showStrength
      />
      <PasswordField
        control={form.control}
        name="confirm"
        label={t('settings.password.confirm')}
        autoComplete="new-password"
      />
      <FormAlert messageKey={form.formState.errors.root?.message} />
      <SubmitButton
        variant="outline-primary"
        pending={form.formState.isSubmitting}
        pendingLabel={t('settings.password.submitting')}
        className="mt-2"
      >
        {t('settings.password.submit')}
      </SubmitButton>
    </form>
  )
}
