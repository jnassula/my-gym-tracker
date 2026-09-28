import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AuthScreen } from '@/features/auth/auth-screen'
import { RegisterForm } from '@/features/auth/register-form'

export const Route = createFileRoute('/_auth/register')({
  component: Register,
})

function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <AuthScreen
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
      footer={
        <>
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" className="text-primary">
            {t('auth.register.login')}
          </Link>
        </>
      }
    >
      <RegisterForm onSuccess={() => void navigate({ to: '/' })} />
    </AuthScreen>
  )
}
