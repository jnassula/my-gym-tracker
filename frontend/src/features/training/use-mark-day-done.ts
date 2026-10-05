import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { errorKey } from '@/features/auth/errors'

import { setDayDone } from './api'

/**
 * "Marcar treino como feito": no sets, no summary to show, so a toast says it happened and
 * offers the way back ("Anular"), which still works after the screen moved on.
 */
export function useMarkDayDone(dayId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => setDayDone(queryClient, dayId, true),
    onSuccess: () => {
      toast.success(t('training.dayDone.marked'), {
        action: {
          label: t('training.dayDone.undo'),
          onClick: () => {
            setDayDone(queryClient, dayId, false).catch((error: unknown) => toast.error(t(errorKey(error))))
          },
        },
      })
    },
  })
}
