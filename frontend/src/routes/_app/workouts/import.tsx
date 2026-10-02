import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { errorKey } from '@/features/auth/errors'
import { discardUpload, importFiles, useCreatePlan } from '@/features/workouts/api'
import {
  draftFromPreview,
  draftReducer,
  toPlanCreate,
  type Draft,
  type DraftAction,
} from '@/features/workouts/import-draft'
import { ImportReview } from '@/features/workouts/import-review'
import { isImportError, type ImportErrorCode } from '@/features/workouts/import-errors'
import { checkFiles } from '@/features/workouts/import-files'
import { ImportErrorState, ImportSuccess, ReadingState } from '@/features/workouts/import-states'
import { PdfDropzone } from '@/features/workouts/pdf-dropzone'
import type { Plan } from '@/features/workouts/types'
import { ApiError } from '@/lib/api'

export const Route = createFileRoute('/_app/workouts/import')({
  component: ImportPdf,
})

type Failure = { code: ImportErrorCode; file: File }

function draftState(draft: Draft | null, action: DraftAction | { type: 'load'; draft: Draft | null }) {
  if (action.type === 'load') return action.draft
  return draft && draftReducer(draft, action)
}

function ImportPdf() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [draft, dispatch] = useReducer(draftState, null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [created, setCreated] = useState<Plan | null>(null)
  const createPlan = useCreatePlan()

  const upload = useMutation({
    mutationFn: importFiles,
    onMutate: () => setFailure(null),
    onSuccess: (preview) => dispatch({ type: 'load', draft: draftFromPreview(preview) }),
    onError: (error, files) => {
      if (error instanceof ApiError && isImportError(error.code)) setFailure({ code: error.code, file: files[0] })
    },
  })

  const onFiles = (files: File[]) => {
    // Cheap checks first; the server validates the bytes anyway.
    const problem = checkFiles(files)
    if (problem) setFailure(problem)
    else upload.mutate(files)
  }

  const reset = () => {
    setFailure(null)
    upload.reset()
  }

  const cancel = async () => {
    if (draft) await discardUpload(draft.fileId).catch(() => undefined)
    await navigate({ to: '/workouts' })
  }

  let content
  if (created) {
    content = <ImportSuccess plan={created} />
  } else if (draft) {
    content = (
      <ImportReview
        draft={draft}
        dispatch={dispatch}
        saving={createPlan.isPending}
        errorKey={createPlan.error ? errorKey(createPlan.error) : undefined}
        onConfirm={() => createPlan.mutate(toPlanCreate(draft), { onSuccess: setCreated })}
        onCancel={() => void cancel()}
      />
    )
  } else if (upload.isPending) {
    content = <ReadingState files={upload.variables} />
  } else if (failure) {
    content = <ImportErrorState code={failure.code} file={failure.file} onRetry={reset} />
  } else {
    content = (
      <div className="grid gap-4">
        <PdfDropzone onFiles={onFiles} />
        {upload.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t(errorKey(upload.error))}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{t('import.hint')}</p>
      </div>
    )
  }

  return (
    <Page title={t('import.title')} back="/workouts">
      {content}
    </Page>
  )
}
