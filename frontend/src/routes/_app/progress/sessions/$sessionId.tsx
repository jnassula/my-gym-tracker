import { createFileRoute } from '@tanstack/react-router'

import { SessionScreen } from '@/features/progress/session-screen'

export const Route = createFileRoute('/_app/progress/sessions/$sessionId')({
  component: Session,
})

function Session() {
  const { sessionId } = Route.useParams()
  return <SessionScreen sessionId={sessionId} />
}
