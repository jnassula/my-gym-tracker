import {
  CaretRightIcon,
  CopyIcon,
  FilePdfIcon,
  PencilSimpleLineIcon,
  PlusIcon,
  type Icon,
} from '@phosphor-icons/react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

import { useWorkoutLabels } from '../labels'
import type { PlanSummary } from '../types'
import { exerciseCount, type BuilderDraft } from './draft'



type Option = {
  icon: Icon
  title: string
  body: string
  link?: Pick<LinkProps, 'to' | 'search'>
  onClick?: () => void
}

function OptionRow({ icon: Icon, title, body, link, onClick }: Option) {
  const inner = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
      <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </>
  )
  const className = 'flex min-h-16 w-full items-center gap-3 rounded-xl bg-card px-3 py-2 text-left'
  return (
    <li>
      {link ? (
        <Link {...link} className={className}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {inner}
        </button>
      )}
    </li>
  )
}

type NewPlanSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The user's plans, for "Duplicar treino existente". */
  plans: PlanSummary[]
  /** A plan half-built on this device, offered first; "Criar do zero" replaces it. */
  draft: BuilderDraft | null
}

/** "+ Novo": the one entry for a PDF, a plan from scratch or a copy of an existing one. */
export function NewPlanSheet({ open, onOpenChange, plans, draft }: NewPlanSheetProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const [picking, setPicking] = useState(false)
  const only = plans.length === 1 ? plans[0] : null

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setPicking(false)
        onOpenChange(next)
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-md gap-4 rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
        <SheetTitle className="text-lg">
          {picking ? t('builder.new.duplicate.pick') : t('builder.new.title')}
        </SheetTitle>
        {picking ? (
          <ul className="grid gap-2">
            {plans.map((plan) => (
              <OptionRow
                key={plan.id}
                icon={CopyIcon}
                title={plan.name}
                body={labels.summary(plan.weekdays.length, plan.exercise_count)}
                link={{ to: '/workouts/new', search: { duplicate: plan.id } }}
              />
            ))}
          </ul>
        ) : (
          <ul className="grid gap-2">
            {draft && (
              <OptionRow
                icon={PencilSimpleLineIcon}
                title={t('builder.draft.resume')}
                body={`${draft.name.trim() || t('builder.draft.unnamed')} · ${labels.summary(draft.days.length, exerciseCount(draft))}`}
                link={{ to: '/workouts/new', search: {} }}
              />
            )}
            <OptionRow
              icon={FilePdfIcon}
              title={t('builder.new.import.title')}
              body={t('builder.new.import.body')}
              link={{ to: '/workouts/import' }}
            />
            <OptionRow
              icon={PlusIcon}
              title={t('builder.new.scratch.title')}
              body={t('builder.new.scratch.body')}
              link={{ to: '/workouts/new', search: { fresh: true } }}
            />
            {plans.length > 0 && (
              <OptionRow
                icon={CopyIcon}
                title={t('builder.new.duplicate.title')}
                body={only ? t('builder.new.duplicate.body', { name: only.name }) : t('builder.new.duplicate.bodyMany')}
                {...(only
                  ? { link: { to: '/workouts/new', search: { duplicate: only.id } } }
                  : { onClick: () => setPicking(true) })}
              />
            )}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  )
}
