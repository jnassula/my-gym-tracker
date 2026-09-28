import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { SHORTCUT_NAME, shortcutUrl, syncUrl } from './api'
import { ShortcutSteps } from './shortcut-steps'

/** Right after connecting: the address and header to paste into the shortcut (the token is shown
 * only now), and how to build the shortcut. */
export function ShortcutSetup({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h2 className="text-lg">{t('health.setup.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('health.setup.intro', { name: SHORTCUT_NAME })}</p>
      </div>
      <Card className="grid gap-4 p-4">
        <CopyField label={t('health.setup.address')} value={syncUrl()} />
        <CopyField label={t('health.setup.header')} value={`Bearer ${token}`} />
        <p className="text-xs text-muted-foreground">{t('health.setup.tokenOnce')}</p>
      </Card>
      <ShortcutSteps />
      <div className="grid gap-2">
        <a href={shortcutUrl()} className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }))}>
          {t('health.setup.run')}
        </a>
        <Button variant="outline" size="touch" onClick={onDone}>
          {t('health.setup.done')}
        </Button>
      </div>
    </div>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
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
