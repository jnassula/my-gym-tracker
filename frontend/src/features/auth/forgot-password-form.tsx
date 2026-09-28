import { zodResolver } from '@hookform/resolvers/zod'
import { CheckIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { requestPasswordReset } from './api'
import { errorKey } from './errors'
import { TextField } from './form-fields'
import { FormAlert, SubmitButton } from './form-parts'
import { forgotPasswordSchema, type ForgotPasswordValues } from './schemas'

export function ForgotPasswordForm() {
  const { t } = useTranslation()
  const [sent, setSent] = useState(false)
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (error) {
      form.setError('root', { message: errorKey(error) })
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
      <FormAlert messageKey={form.formState.errors.root?.message} />
      <SubmitButton
        variant="outline-primary"
        pending={form.formState.isSubmitting}
        pendingLabel={t('auth.forgot.submitting')}
      >
        {t('auth.forgot.submit')}
      </SubmitButton>
      {sent && (
        <Alert role="status">
          <CheckIcon />
          <AlertTitle>{t('auth.forgot.sentTitle')}</AlertTitle>
          <AlertDescription>
            <p>
              {t('auth.forgot.sentBody')}{' '}
              <Button
                type="submit"
                variant="link"
                className="h-auto p-0"
                disabled={form.formState.isSubmitting}
              >
                {t('auth.forgot.resend')}
              </Button>
            </p>
          </AlertDescription>
        </Alert>
      )}
    </form>
  )
}
