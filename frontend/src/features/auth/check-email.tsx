import { EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { resendVerification } from './api'
import { errorKey } from './errors'
import { FormAlert } from './form-parts'

/** "Confirma o teu email": the account opens with the link sent to its address. */
export function CheckEmail({ email }: { email: string }) {
  const { t } = useTranslation()
  const resend = useMutation({ mutationFn: () => resendVerification(email) })
  return (
    <div className="grid gap-3.5">
      <Alert role="status">
        <EnvelopeSimpleIcon />
        <AlertTitle>{t('auth.verify.sentTitle')}</AlertTitle>
        <AlertDescription>
          <p>{t('auth.verify.sentBody', { email })}</p>
          <p>{resend.isSuccess ? t('auth.verify.resent') : t('auth.verify.spam')}</p>
        </AlertDescription>
      </Alert>
      {resend.error && <FormAlert messageKey={errorKey(resend.error)} />}
      <Button
        type="button"
        variant="outline-primary"
        size="touch"
        disabled={resend.isPending}
        onClick={() => resend.mutate()}
      >
        {t('auth.verify.resend')}
      </Button>
    </div>
  )
}
