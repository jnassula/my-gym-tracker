import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

/** A value to paste into a source's bridge (the address, the token), with a copy button. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => toast.error(t('health.setup.copyFailed')),
    )
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 rounded-lg bg-background px-3 py-2.5 font-mono text-[13px] break-all select-all">
          {value}
        </code>
        <Button
          variant="outline"
          size="icon-touch"
          aria-label={copied ? t('health.setup.copied') : t('health.setup.copy', { what: label })}
          onClick={copy}
        >
          {copied ? <CheckIcon className="text-primary" /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  )
}
