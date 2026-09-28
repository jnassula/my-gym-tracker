import { UploadSimpleIcon } from '@phosphor-icons/react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Custom drop zone (the design flags it as not in shadcn): drag a PDF or pick one. */
export function PdfDropzone({ onFile }: { onFile: (file: File) => void }) {
  const { t } = useTranslation()
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) onFile(file)
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
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          event.target.value = '' // picking the same file again still fires
        }}
      />
      <Button variant="outline-primary" size="touch" onClick={() => input.current?.click()}>
        {t('import.chooseFile')}
      </Button>
    </div>
  )
}
