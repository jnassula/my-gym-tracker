import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import { formatFileSize } from './format'
import type { ImportErrorCode } from './import-errors'
import type { Plan } from './types'

function FileLine({ file }: { file: File }) {
  const { i18n } = useTranslation()
  return (
    <p className="truncate text-sm text-muted-foreground">
      {file.name} · {formatFileSize(file.size, i18n.language)}
    </p>
  )
}

export function ReadingState({ file }: { file: File }) {
  const { t } = useTranslation()
  return (
    <Card className="items-center gap-3 px-4 py-8 text-center" role="status">
      <Spinner className="size-6 text-primary" />
      <p className="font-medium">{t('import.reading')}</p>
      <FileLine file={file} />
    </Card>
  )
}

export function ImportErrorState({
  code,
  file,
  onRetry,
}: {
  code: ImportErrorCode
  file: File
  onRetry: () => void
}) {
  const { t, i18n } = useTranslation()
  const values = { name: file.name, size: formatFileSize(file.size, i18n.language) }
  return (
    <div className="grid gap-3">
      <Alert variant="destructive">
        <WarningCircleIcon />
        <AlertTitle>{t(`import.errors.${code}.title`)}</AlertTitle>
        <AlertDescription>{t(`import.errors.${code}.body`, values)}</AlertDescription>
      </Alert>
      <Button variant="outline-primary" size="hero" onClick={onRetry}>
        {t('import.anotherFile')}
      </Button>
    </div>
  )
}

export function ImportSuccess({ plan }: { plan: Plan }) {
  const { t } = useTranslation()
  const exercises = plan.days.flatMap((day) => day.exercises)
  const groups = new Set(
    exercises.map((e) => e.muscle_group).filter((g) => g !== null && g !== 'warmup' && g !== 'cardio'),
  )
  return (
    <div className="grid gap-4">
      <Card className="gap-2 px-4 ring-primary/60" role="status">
        <div className="flex items-center gap-2">
          <CheckCircleIcon className="size-6 text-primary" weight="fill" />
          <h2 className="text-lg">{t('import.success.title', { name: plan.name })}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('import.success.summary', {
            days: plan.days.length,
            exercises: exercises.length,
            groups: groups.size,
          })}
        </p>
        {plan.is_active && <p className="text-sm">{t('import.success.active')}</p>}
      </Card>
      <Link
        to="/workouts/$planId"
        params={{ planId: plan.id }}
        className={cn(buttonVariants({ size: 'hero' }))}
      >
        {t('import.success.viewPlan')}
      </Link>
      <Link to="/workouts" className={cn(buttonVariants({ variant: 'outline', size: 'touch' }))}>
        {t('import.success.backToList')}
      </Link>
    </div>
  )
}
