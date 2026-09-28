import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Page } from '@/components/app-shell/page'
import { ChangePasswordForm } from '@/features/auth/change-password-form'

export const Route = createFileRoute('/_app/settings/password')({
  component: ChangePassword,
})

function ChangePassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <Page title={t('settings.password.title')} back="/settings">
      <ChangePasswordForm
        onSuccess={() => {
          toast.success(t('settings.password.success'))
          void navigate({ to: '/settings' })
        }}
      />
    </Page>
  )
}
