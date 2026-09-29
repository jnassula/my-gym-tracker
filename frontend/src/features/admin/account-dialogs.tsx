import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'

import { useDeleteAccount, useSetAccountActive } from './api'
import type { AdminUser } from './types'
import type { AccountAction } from './users-table'

/** Side by side from a tablet up; on a phone the longer labels need the whole width. */
const FOOTER = 'grid grid-cols-1 gap-2 sm:grid-cols-2'

type DialogProps = { action: AccountAction | null; onClose: () => void }

/** Deactivating can be undone, so one confirmation is enough. */
export function DeactivateDialog({ action, onClose }: DialogProps) {
  const user = action?.kind === 'deactivate' ? action.user : null
  return (
    <AlertDialog open={user !== null} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>{user && <Deactivate key={user.id} user={user} onClose={onClose} />}</AlertDialogContent>
    </AlertDialog>
  )
}

function Deactivate({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { t } = useTranslation()
  const status = useSetAccountActive()
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('admin.users.deactivateTitle', { name: user.name })}</AlertDialogTitle>
        <AlertDialogDescription>{t('admin.users.deactivateBody')}</AlertDialogDescription>
      </AlertDialogHeader>
      {status.error && <FormAlert messageKey={errorKey(status.error)} />}
      <AlertDialogFooter className={FOOTER}>
        <AlertDialogCancel variant="outline" size="touch">
          {t('admin.users.cancel')}
        </AlertDialogCancel>
        <Button
          variant="outline-primary"
          size="touch"
          disabled={status.isPending}
          onClick={() =>
            status.mutate(
              { id: user.id, active: false },
              {
                onSuccess: () => {
                  toast.success(t('admin.users.deactivated'))
                  onClose()
                },
              },
            )
          }
        >
          {status.isPending && <Spinner />}
          {t('admin.users.deactivateConfirm')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}

/** Deleting can't be undone: the account's email has to be typed before the button works. */
export function DeleteDialog({ action, onClose }: DialogProps) {
  const user = action?.kind === 'delete' ? action.user : null
  return (
    <AlertDialog open={user !== null} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>{user && <Delete key={user.id} user={user} onClose={onClose} />}</AlertDialogContent>
    </AlertDialog>
  )
}

function Delete({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const remove = useDeleteAccount()
  const [typed, setTyped] = useState('')
  const confirmed = typed.trim().toLowerCase() === user.email
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!confirmed) return
        remove.mutate(user.id, {
          onSuccess: () => {
            toast.success(t('admin.users.deleted'))
            onClose()
          },
        })
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{t('admin.users.deleteTitle', { name: user.name })}</AlertDialogTitle>
        <AlertDialogDescription>{t('admin.users.deleteBody')}</AlertDialogDescription>
      </AlertDialogHeader>
      <Field>
        <FieldLabel htmlFor={id}>{t('admin.users.deleteType', { email: user.email })}</FieldLabel>
        <Input
          id={id}
          value={typed}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => setTyped(event.target.value)}
        />
      </Field>
      {remove.error && <FormAlert messageKey={errorKey(remove.error)} />}
      <AlertDialogFooter className={FOOTER}>
        <AlertDialogCancel variant="outline" size="touch">
          {t('admin.users.cancel')}
        </AlertDialogCancel>
        <Button type="submit" variant="destructive" size="touch" disabled={!confirmed || remove.isPending}>
          {remove.isPending && <Spinner />}
          {t('admin.users.deleteConfirm')}
        </Button>
      </AlertDialogFooter>
    </form>
  )
}
