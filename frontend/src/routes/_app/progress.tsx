import { ChartLineUpIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/app-shell/empty-state'
import { Page } from '@/components/app-shell/page'

export const Route = createFileRoute('/_app/progress')({
  component: Progress,
})

function Progress() {
  const { t } = useTranslation()
  return (
    <Page title={t('nav.progress')}>
      <EmptyState
        icon={ChartLineUpIcon}
        title={t('empty.progress.title')}
        description={t('empty.progress.description')}
      />
    </Page>
  )
}
