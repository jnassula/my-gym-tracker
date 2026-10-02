import { DownloadSimpleIcon, ShareNetworkIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { SwitchRow } from '@/features/settings/rows'
import { useRequiredSession } from '@/lib/auth'

import { canShareFiles, downloadPdf, fetchPdf, sharePdf } from './export'
import { formatDate, formatRest } from './format'
import { useWorkoutLabels } from './labels'
import type { Plan } from './types'

type ExportSheetProps = {
  open: boolean
  plan: Plan
  onOpenChange: (open: boolean) => void
}

/** "Exportar PDF": a look at the paper, the weights switch, then share or save. */
export function ExportSheet({ open, plan, onOpenChange }: ExportSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[92dvh] max-w-md gap-4 overflow-y-auto rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        {open && <ExportForm plan={plan} />}
      </SheetContent>
    </Sheet>
  )
}

function ExportForm({ plan }: { plan: Plan }) {
  const { t } = useTranslation()
  const { user } = useRequiredSession()
  const [weights, setWeights] = useState(true)
  const shareable = canShareFiles()

  const share = useMutation({
    mutationFn: async () => sharePdf(await fetchPdf(plan.id, plan.name, weights), plan.name),
  })
  const save = useMutation({
    mutationFn: async () => downloadPdf(await fetchPdf(plan.id, plan.name, weights)),
  })
  const busy = share.isPending || save.isPending
  // Closing the share sheet without picking anything is not an error worth showing.
  const failure = [share.error, save.error].find((error) => error && error.name !== 'AbortError')

  return (
    <div className="grid gap-4">
      <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
      <div className="flex items-baseline justify-between gap-3">
        <SheetTitle className="text-lg">{t('export.title')}</SheetTitle>
        <span className="text-sm text-muted-foreground">{t('export.pages', { count: plan.days.length })}</span>
      </div>

      <Paper plan={plan} student={user.name} />

      <Card className="gap-0 py-0">
        <SwitchRow
          label={t('export.weights')}
          hint={t('export.weightsHint')}
          checked={weights}
          onCheckedChange={setWeights}
        />
      </Card>
      <p className="text-sm text-muted-foreground">{t('export.note')}</p>

      <FormAlert messageKey={failure ? errorKey(failure) : undefined} />

      <div className="grid gap-2">
        {shareable && (
          <Button size="hero" disabled={busy} onClick={() => share.mutate()}>
            {share.isPending ? <Spinner /> : <ShareNetworkIcon />}
            {t('export.share')}
          </Button>
        )}
        <Button
          variant={shareable ? 'outline-primary' : 'default'}
          size={shareable ? 'touch' : 'hero'}
          disabled={busy}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Spinner /> : <DownloadSimpleIcon />}
          {t('export.save')}
        </Button>
      </div>
    </div>
  )
}

/** A sheet of paper, in miniature: the first two days, as the PDF lays them out. */
function Paper({ plan, student }: { plan: Plan; student: string }) {
  const { t, i18n } = useTranslation()
  const labels = useWorkoutLabels()
  const shown = plan.days.slice(0, 2)
  return (
    <div
      aria-label={t('export.preview')}
      className="mx-auto w-full max-w-[17rem] rounded-sm bg-white px-4 py-4 text-[0.5rem] leading-snug text-neutral-800 shadow-md"
    >
      <p className="text-[0.75rem] font-semibold text-neutral-900">{plan.name}</p>
      <p className="text-neutral-500">
        {t('export.student', { name: student })}
        {plan.valid_until && ` · ${t('workouts.validUntil', { date: formatDate(plan.valid_until, i18n.language) })}`}
      </p>
      {shown.map((day) => (
        <div key={day.id} className="mt-2">
          <p className="font-semibold text-[#6d5ec7]">
            {labels.weekdayLong(day.weekday)}
            {day.label && ` — ${day.label}`}
          </p>
          <table className="mt-0.5 w-full border-collapse">
            <thead>
              <tr className="text-left text-[0.45rem] tracking-wider text-neutral-400 uppercase">
                <th className="border-b border-neutral-200 py-0.5 font-medium">{t('exercise.name')}</th>
                <th className="border-b border-neutral-200 py-0.5 font-medium">{t('exercise.sets')}</th>
                <th className="border-b border-neutral-200 py-0.5 font-medium">{t('export.rest')}</th>
              </tr>
            </thead>
            <tbody>
              {day.exercises.slice(0, 8).map((exercise) => (
                <tr key={exercise.id} className="border-b border-neutral-100">
                  <td className="py-0.5 pr-1">{exercise.name}</td>
                  <td className="py-0.5 pr-1 whitespace-nowrap">
                    {exercise.sets !== null && exercise.reps !== null
                      ? `${exercise.sets}×${exercise.reps}`
                      : (exercise.reps ?? (exercise.sets !== null ? `${exercise.sets}×` : '—'))}
                  </td>
                  <td className="py-0.5 whitespace-nowrap">
                    {formatRest(exercise.rest_seconds, exercise.rest_max_seconds) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {plan.days.length > shown.length && <p className="mt-2 text-neutral-400">…</p>}
    </div>
  )
}
