import { UploadSimpleIcon } from '@phosphor-icons/react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { ACCEPT } from './import-files'

/** Custom drop zone (the design flags it as not in shadcn): drag a PDF or photos, or pick them. */
export function PdfDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const { t } = useTranslation()
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const files = [...event.dataTransfer.files]
    if (files.length > 0) onFiles(files)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed border-border px-6 py-10 text-center transition-colors',
        dragging && 'border-primary bg-accent/40',
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl border border-primary text-primary">
        <UploadSimpleIcon className="size-6" />
      </div>
      <div>
        <p className="text-base font-medium">{t('import.dropHere')}</p>
        <p className="text-sm text-muted-foreground">{t('import.limits')}</p>
      </div>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          if (files.length > 0) onFiles(files)
          event.target.value = '' // picking the same files again still fires
        }}
      />
      <Button variant="outline-primary" size="touch" onClick={() => input.current?.click()}>
        {t('import.chooseFile')}
      </Button>
    </div>
  )
}
