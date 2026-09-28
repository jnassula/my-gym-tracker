import { CalendarCheckIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/app-shell/empty-state'
import { Page } from '@/components/app-shell/page'

export const Route = createFileRoute('/_app/')({
  component: Today,
})

function Today() {
  const { t } = useTranslation()
  return (
    <Page title={t('nav.today')}>
      <EmptyState
        icon={CalendarCheckIcon}
        title={t('empty.today.title')}
        description={t('empty.today.description')}
      />
    </Page>
  )
}
