import { DotsThreeIcon, FilePdfIcon, PlusIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/app-shell/empty-state'
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
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { openFile, plansQuery, useDeletePlan, useUpdatePlan } from '@/features/workouts/api'
import { formatDate, formatFileSize } from '@/features/workouts/format'
import type { PlanSummary } from '@/features/workouts/types'

type Action = { kind: 'rename' | 'delete'; plan: PlanSummary } | null

/** PDFs importados: view, rename, make active or delete each imported plan. */
export function PdfsScreen() {
  const { t } = useTranslation()
  const plans = useQuery(plansQuery())
  const [action, setAction] = useState<Action>(null)

  return (
    <Page
      title={t('pdfs.title')}
      back="/settings"
      action={
        <Link
          to="/workouts/import"
          aria-label={t('workouts.addPdfLabel')}
          className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }), 'h-11 px-3')}
        >
          <PlusIcon />
          {t('workouts.addPdf')}
        </Link>
      }
    >
      {plans.isPending ? (
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      ) : plans.isError ? (
        <FormAlert messageKey={errorKey(plans.error)} />
      ) : plans.data.length === 0 ? (
        <EmptyState icon={FilePdfIcon} title={t('pdfs.emptyTitle')} description={t('pdfs.emptyDescription')} />
      ) : (
        <ul className="grid gap-2.5">
          {plans.data.map((plan) => (
            <li key={plan.id}>
              <PlanItem plan={plan} onAction={setAction} />
            </li>
          ))}
        </ul>
      )}
      <RenameDialog action={action} onClose={() => setAction(null)} />
      <DeleteDialog action={action} onClose={() => setAction(null)} />
    </Page>
  )
}

function PlanItem({ plan, onAction }: { plan: PlanSummary; onAction: (action: Action) => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const update = useUpdatePlan()
  const file = plan.source_file

  const view = () => {
    if (!file) return
    openFile(file.id).catch((error: unknown) => toast.error(t(errorKey(error))))
  }
  const activate = () =>
    update.mutate(
      { id: plan.id, is_active: true },
      {
        onSuccess: () => toast.success(t('pdfs.activated', { name: plan.name })),
        onError: (error) => toast.error(t(errorKey(error))),
      },
    )

  const details = [
    t('pdfs.days', { count: plan.day_count }),
    t('workouts.exerciseCount', { count: plan.exercise_count }),
    plan.valid_until ? t('pdfs.validUntil', { date: formatDate(plan.valid_until, locale) }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card className={cn('gap-3 p-3.5', plan.is_active && 'ring-1 ring-primary')}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-12 w-10 shrink-0 items-center justify-center rounded-md border bg-background text-[9px] text-muted-foreground"
        >
          PDF
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[15px] font-medium">{plan.name}</span>
            {plan.is_active && <Badge className="shrink-0">{t('workouts.active')}</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {file
              ? t('pdfs.file', {
                  file: file.filename,
                  size: formatFileSize(file.size_bytes, locale),
                  date: formatDate(plan.created_at.slice(0, 10), locale),
                })
              : t('pdfs.noFile', { date: formatDate(plan.created_at.slice(0, 10), locale) })}
          </p>
          <p className="text-xs text-muted-foreground">{details}</p>
          {!plan.is_active && (
            <button
              type="button"
              disabled={update.isPending}
              onClick={activate}
              className="mt-1.5 min-h-11 text-[13px] font-medium text-primary"
            >
              {t('pdfs.makeActive')}
            </button>
          )}
        </div>
        {!plan.is_active && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-touch" aria-label={t('pdfs.more', { name: plan.name })} />
              }
            >
              <DotsThreeIcon weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {file && (
                <DropdownMenuItem className="min-h-11" onClick={view}>
                  {t('pdfs.view')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="min-h-11" onClick={() => onAction({ kind: 'rename', plan })}>
                {t('pdfs.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11 text-destructive"
                onClick={() => onAction({ kind: 'delete', plan })}
              >
                {t('pdfs.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {plan.is_active && (
        <div className="grid grid-cols-3 gap-1.5">
          <Button variant="outline" size="touch" className="h-11 px-2 text-[13px]" disabled={!file} onClick={view}>
            {t('pdfs.view')}
          </Button>
          <Button
            variant="outline"
            size="touch"
            className="h-11 px-2 text-[13px]"
            onClick={() => onAction({ kind: 'rename', plan })}
          >
            {t('pdfs.rename')}
          </Button>
          <Button
            variant="outline"
            size="touch"
            className="h-11 px-2 text-[13px] text-destructive"
            onClick={() => onAction({ kind: 'delete', plan })}
          >
            {t('pdfs.delete')}
          </Button>
        </div>
      )}
    </Card>
  )
}

function RenameDialog({ action, onClose }: { action: Action; onClose: () => void }) {
  const open = action?.kind === 'rename'
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent showCloseButton={false}>
        {open && <RenameForm key={action.plan.id} plan={action.plan} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({ plan, onClose }: { plan: PlanSummary; onClose: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const update = useUpdatePlan()
  const [name, setName] = useState(plan.name)
  const trimmed = name.trim()
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!trimmed) return
        update.mutate({ id: plan.id, name: trimmed }, { onSuccess: onClose })
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('pdfs.renameTitle')}</DialogTitle>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={id}>{t('pdfs.name')}</FieldLabel>
        <Input id={id} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </Field>
      {update.error && <FormAlert messageKey={errorKey(update.error)} />}
      <DialogFooter className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="touch" onClick={onClose}>
          {t('pdfs.cancel')}
        </Button>
        <Button type="submit" variant="outline-primary" size="touch" disabled={!trimmed || update.isPending}>
          {t('pdfs.save')}
        </Button>
      </DialogFooter>
    </form>
  )
}

function DeleteDialog({ action, onClose }: { action: Action; onClose: () => void }) {
  const { t } = useTranslation()
  const remove = useDeletePlan()
  const plan = action?.kind === 'delete' ? action.plan : null
  return (
    <AlertDialog open={plan !== null} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        {plan && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('pdfs.deleteTitle', { name: plan.name })}</AlertDialogTitle>
              <AlertDialogDescription>{t('pdfs.deleteBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            {remove.error && <FormAlert messageKey={errorKey(remove.error)} />}
            <AlertDialogFooter className="grid grid-cols-2 gap-2">
              <AlertDialogCancel variant="outline" size="touch">
                {t('pdfs.cancel')}
              </AlertDialogCancel>
              <Button
                variant="destructive"
                size="touch"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(plan.id, {
                    onSuccess: () => {
                      toast.success(t('pdfs.deleted'))
                      onClose()
                    },
                  })
                }
              >
                {t('pdfs.deleteConfirm')}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
