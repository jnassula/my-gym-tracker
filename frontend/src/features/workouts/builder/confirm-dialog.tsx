import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export type Confirmation = {
  title: string
  body?: string
  confirmLabel: string
  onConfirm: () => void
}

/** One question before something in the draft is thrown away. */
export function ConfirmDialog({ confirmation, onClose }: { confirmation: Confirmation | null; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={confirmation !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        {confirmation && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
              {confirmation.body && <AlertDialogDescription>{confirmation.body}</AlertDialogDescription>}
            </AlertDialogHeader>
            <AlertDialogFooter className="grid grid-cols-2 gap-2">
              <AlertDialogCancel variant="outline" size="touch">
                {t('exercise.cancel')}
              </AlertDialogCancel>
              <Button
                variant="destructive"
                size="touch"
                onClick={() => {
                  confirmation.onConfirm()
                  onClose()
                }}
              >
                {confirmation.confirmLabel}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
