import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AuthScreen } from '@/features/auth/auth-screen'
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form'

export const Route = createFileRoute('/_auth/forgot-password')({
  component: ForgotPassword,
})

function ForgotPassword() {
  const { t } = useTranslation()
  return (
    <AuthScreen
      title={t('auth.forgot.title')}
      subtitle={t('auth.forgot.subtitle')}
      back={{ to: '/login', label: t('auth.forgot.back') }}
    >
      <ForgotPasswordForm />
    </AuthScreen>
  )
}
