import { createFileRoute } from '@tanstack/react-router'

import { PdfsScreen } from '@/features/settings/pdfs-screen'

export const Route = createFileRoute('/_app/settings/pdfs')({
  component: PdfsScreen,
})
