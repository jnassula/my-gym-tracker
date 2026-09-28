import { WarningCircleIcon } from '@phosphor-icons/react'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import { fieldMessage } from './errors'

type SubmitButtonProps = Pick<ComponentProps<typeof Button>, 'variant' | 'size' | 'className'> & {
  pending: boolean
  pendingLabel: string
  children: ReactNode
}

/** Loading state from the design: disabled, spinner and a progressive label. */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
  variant = 'default',
  size = 'hero',
  className,
}: SubmitButtonProps) {
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

/** Form-level error (anything not tied to a single field). */
export function FormAlert({ messageKey }: { messageKey: string | undefined }) {
  const { t } = useTranslation()
  const message = fieldMessage(t, messageKey)
  if (!message) return null
  return (
    <Alert variant="destructive">
      <WarningCircleIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
