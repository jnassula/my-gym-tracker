import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { resetPassword } from './api'
import { errorKey } from './errors'
import { PasswordField } from './form-fields'
import { FormAlert, SubmitButton } from './form-parts'
import { resetPasswordSchema, type ResetPasswordValues } from './schemas'

export function ResetPasswordForm({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const { t } = useTranslation()
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await resetPassword(token, password)
      onSuccess()
    } catch (error) {
      form.setError('root', { message: errorKey(error) })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3.5">
      <PasswordField
        control={form.control}
        name="password"
        label={t('auth.reset.newPassword')}
        autoComplete="new-password"
        showStrength
      />
      <PasswordField
        control={form.control}
        name="confirm"
        label={t('auth.reset.confirm')}
        autoComplete="new-password"
      />
      <FormAlert messageKey={form.formState.errors.root?.message} />
      <SubmitButton pending={form.formState.isSubmitting} pendingLabel={t('auth.reset.submitting')}>
        {t('auth.reset.submit')}
      </SubmitButton>
    </form>
  )
}
