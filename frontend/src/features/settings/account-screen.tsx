import { DownloadSimpleIcon, TrashIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Page } from '@/components/app-shell/page'
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
import { deleteAccount } from '@/features/auth/api'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { downloadData } from '@/features/settings/api'
import { useRequiredSession } from '@/lib/auth'

/** Side by side from a tablet up; on a phone the longer labels need the whole width. */
const FOOTER = 'grid grid-cols-1 gap-2 sm:grid-cols-2'

/** Definições → Conta e dados: take one's data away, or delete the account with all of it. */
export function AccountScreen() {
  const { t } = useTranslation()
  const [deleting, setDeleting] = useState(false)
  const exportData = useMutation({
    mutationFn: downloadData,
    onSuccess: () => toast.success(t('settings.accountData.exported')),
    onError: (error) => toast.error(t(errorKey(error))),
  })

  return (
    <Page title={t('settings.accountData.title')} back="/settings">
      <div className="grid gap-6">
        <section className="grid gap-3 rounded-2xl bg-card p-4">
          <h2 className="text-[15px] font-medium">{t('settings.accountData.exportTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.accountData.exportBody')}</p>
          <Button
            variant="outline-primary"
            size="touch"
            disabled={exportData.isPending}
            onClick={() => exportData.mutate()}
          >
            {exportData.isPending ? <Spinner /> : <DownloadSimpleIcon />}
            {t('settings.accountData.export')}
          </Button>
        </section>

        <section className="grid gap-3 rounded-2xl bg-card p-4">
          <h2 className="text-[15px] font-medium">{t('settings.accountData.deleteTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.accountData.deleteBody')}</p>
          <Button
            variant="outline"
            size="touch"
            className="text-destructive"
            onClick={() => setDeleting(true)}
          >
            <TrashIcon />
            {t('settings.accountData.delete')}
          </Button>
        </section>
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>{deleting && <DeleteAccount />}</AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}

/** It can't be undone: the password proves who asks, the typed email that they mean it. */
function DeleteAccount() {
  const { t } = useTranslation()
  const { user } = useRequiredSession()
  const navigate = useNavigate()
  const emailId = useId()
  const passwordId = useId()
  const [typed, setTyped] = useState('')
  const [password, setPassword] = useState('')
  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      toast.success(t('settings.accountData.deleted'))
      await navigate({ to: '/welcome' })
    },
  })
  const confirmed = typed.trim().toLowerCase() === user.email && password.length > 0

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (confirmed) remove.mutate(password)
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{t('settings.accountData.confirmTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('settings.accountData.confirmBody')}</AlertDialogDescription>
      </AlertDialogHeader>
      <Field>
        <FieldLabel htmlFor={emailId}>{t('settings.accountData.typeEmail', { email: user.email })}</FieldLabel>
        <Input
          id={emailId}
          value={typed}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => setTyped(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={passwordId}>{t('settings.accountData.password')}</FieldLabel>
        <Input
          id={passwordId}
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      {remove.error && <FormAlert messageKey={errorKey(remove.error)} />}
      <AlertDialogFooter className={FOOTER}>
        <AlertDialogCancel variant="outline" size="touch">
          {t('settings.accountData.cancel')}
        </AlertDialogCancel>
        <Button type="submit" variant="destructive" size="touch" disabled={!confirmed || remove.isPending}>
          {remove.isPending && <Spinner />}
          {t('settings.accountData.confirm')}
        </Button>
      </AlertDialogFooter>
    </form>
  )
}
