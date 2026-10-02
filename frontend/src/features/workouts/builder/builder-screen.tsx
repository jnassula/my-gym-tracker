import { DotsThreeIcon, TrashIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BackLink, Page } from '@/components/app-shell/page'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'

import { planQuery, plansQuery, useCreatePlan } from '../api'
import { ImportSuccess } from '../import-states'
import { useWorkoutLabels } from '../labels'
import type { Plan } from '../types'
import { ConfirmDialog, type Confirmation } from './confirm-dialog'
import {
  builderReducer,
  draftFromPlan,
  emptyDraft,
  structureOf,
  toPlanCreate,
  type BuilderAction,
  type BuilderDraft,
  type Wording,
} from './draft'
import { StepDays } from './step-days'
import { StepName, type StructureChoice } from './step-name'
import { StepReview } from './step-review'
import type { BuilderSearch, Step } from './search'
import { clearDraft, loadDraft, saveDraft } from './storage'
import { STRUCTURES } from './templates'

type State = { draft: BuilderDraft; loaded: boolean }

function reducer(state: State, action: BuilderAction | { type: 'load'; draft: BuilderDraft }): State {
  if (action.type === 'load') return { draft: action.draft, loaded: true }
  return { ...state, draft: builderReducer(state.draft, action) }
}

const isBlank = (draft: BuilderDraft) => draft.name.trim() === '' && draft.days.length === 0

type BuilderScreenProps = {
  search: BuilderSearch
  onSearchChange: (search: BuilderSearch, replace?: boolean) => void
}

/** Treinos → + Novo → Criar do zero: three steps over a draft kept on this device. */
export function BuilderScreen({ search, onSearchChange }: BuilderScreenProps) {
  const { t } = useTranslation()
  const labels = useWorkoutLabels()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const plans = useQuery(plansQuery())
  const source = useQuery({ ...planQuery(search.duplicate ?? ''), enabled: Boolean(search.duplicate) })
  const createPlan = useCreatePlan()
  const [created, setCreated] = useState<Plan | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [state, dispatch] = useReducer(reducer, undefined, (): State => {
    if (search.fresh || search.duplicate) return { draft: emptyDraft(), loaded: false }
    return { draft: loadDraft() ?? emptyDraft(), loaded: true }
  })
  const { draft, loaded } = state
  const step: Step = draft.days.length === 0 ? 1 : (search.step ?? 1)

  // "Criar do zero" with a draft around starts over; "Duplicar" starts from the plan.
  useEffect(() => {
    if (search.fresh) {
      dispatch({ type: 'load', draft: emptyDraft() })
      onSearchChange({}, true)
    } else if (search.duplicate && source.data) {
      dispatch({ type: 'load', draft: draftFromPlan(source.data, t('builder.new.copyName', { name: source.data.name })) })
      onSearchChange({}, true)
    } else if (search.duplicate && source.isError) {
      // The plan is gone: start from nothing rather than from a spinner.
      dispatch({ type: 'load', draft: emptyDraft() })
      onSearchChange({}, true)
    }
  }, [search.fresh, search.duplicate, source.data, source.isError, onSearchChange, t])

  // Saved as it changes; a blank draft leaves nothing behind.
  useEffect(() => {
    if (!loaded || created) return
    if (isBlank(draft)) clearDraft()
    else saveDraft(draft)
  }, [draft, loaded, created])

  const wording: Wording = {
    group: labels.group,
    technique: (technique) => t(`builder.exercise.techniques.${technique}`),
  }

  const goTo = (next: Step, day?: number) => onSearchChange({ step: next, ...(day !== undefined && { day }) })

  const continueFromName = async (choice: StructureChoice) => {
    if (choice.kind === 'template') {
      dispatch({ type: 'apply-structure', structure: STRUCTURES[choice.template] })
    } else if (choice.kind === 'plan') {
      setPreparing(true)
      try {
        const plan = await queryClient.fetchQuery(planQuery(choice.planId))
        dispatch({ type: 'apply-structure', structure: structureOf(plan) })
      } catch {
        // The plan couldn't be read: step 2 starts with the days alone.
      } finally {
        setPreparing(false)
      }
    }
    goTo(2, 0)
  }

  const save = (activate: boolean) =>
    createPlan.mutate(toPlanCreate(draft, wording, activate), {
      onSuccess: (plan) => {
        clearDraft()
        setCreated(plan)
      },
    })

  const discard = () =>
    setConfirmation({
      title: t('builder.draft.discardTitle'),
      body: t('builder.draft.discardBody'),
      confirmLabel: t('builder.draft.discard'),
      onConfirm: () => {
        clearDraft()
        void navigate({ to: '/workouts' })
      },
    })

  if (created) {
    return (
      <Page title={t('builder.review.title')} back="/workouts">
        <ImportSuccess plan={created} title={t('builder.review.saved', { name: created.name })} />
      </Page>
    )
  }

  if (!loaded) {
    return (
      <Page title={t('builder.new.scratch.title')} back="/workouts">
        <Spinner className="mx-auto size-6 text-muted-foreground" />
      </Page>
    )
  }

  const title = step === 3 ? t('builder.review.title') : draft.name.trim() || t('builder.new.scratch.title')
  const dayIndex = Math.min(search.day ?? 0, Math.max(draft.days.length - 1, 0))
  const kicker =
    step === 2
      ? `${t('builder.step', { current: step })} · ${labels.weekdayLong(draft.days[dayIndex].weekday)}`
      : t('builder.step', { current: step })

  return (
    <Page
      kicker={kicker}
      title={title}
      backLink={
        step === 1 ? (
          <BackLink to="/workouts" />
        ) : (
          <BackLink to="/workouts/new" search={{ step: (step - 1) as Step, ...(step === 3 && { day: dayIndex }) }} />
        )
      }
      action={
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-touch" aria-label={t('builder.more')} />}>
            <DotsThreeIcon className="size-6" weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem className="min-h-11" variant="destructive" onClick={discard}>
              <TrashIcon />
              {t('builder.draft.discard')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {step === 1 && (
        <StepName
          draft={draft}
          dispatch={dispatch}
          plans={plans.data ?? []}
          pending={preparing}
          onContinue={(choice) => void continueFromName(choice)}
        />
      )}
      {step === 2 && (
        <StepDays
          draft={draft}
          dispatch={dispatch}
          dayIndex={dayIndex}
          onDayChange={(index) => goTo(2, index)}
          onReview={() => goTo(3)}
        />
      )}
      {step === 3 && (
        <StepReview
          draft={draft}
          dispatch={dispatch}
          saving={createPlan.isPending}
          errorKey={createPlan.error ? errorKey(createPlan.error) : undefined}
          onEditDay={(index) => goTo(2, index)}
          onSave={save}
        />
      )}
      <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </Page>
  )
}
