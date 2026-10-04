import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AuthScreen } from '@/features/auth/auth-screen'
import { LoginForm } from '@/features/auth/login-form'

type LoginSearch = { redirect?: string }

export const Route = createFileRoute('/_auth/login')({
  // Only same-app paths are honoured, so the redirect can't send users off-site.
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const target = search.redirect
    return typeof target === 'string' && /^\/(?![/\\])/.test(target) && !target.includes('\\')
      ? { redirect: target }
      : {}
  },
  component: Login,
})

function Login() {
  const { t } = useTranslation()
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()
  return (
    <AuthScreen
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <>
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="text-primary">
            {t('auth.login.createAccount')}
          </Link>
        </>
      }
    >
      <LoginForm onSuccess={() => void navigate({ to: redirect ?? '/' })} />
    </AuthScreen>
  )
}
