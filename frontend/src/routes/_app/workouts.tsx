import { BarbellIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/app-shell/empty-state'
import { Page } from '@/components/app-shell/page'

export const Route = createFileRoute('/_app/workouts')({
  component: Workouts,
})

function Workouts() {
  const { t } = useTranslation()
  return (
    <Page title={t('nav.workouts')}>
      <EmptyState
        icon={BarbellIcon}
        title={t('empty.workouts.title')}
        description={t('empty.workouts.description')}
      />
    </Page>
  )
}
