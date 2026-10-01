import { useTranslation } from 'react-i18next'

import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { isIos } from '@/lib/platform'
import { cn } from '@/lib/utils'

import { SHORTCUT_NAME, shortcutUrl, syncUrl } from './api'
import { CopyField } from './copy-field'
import { ShortcutSteps } from './shortcut-steps'

/** Right after connecting Apple Health: the address and header to paste into the shortcut (the
 * token is shown only now), and how to build the shortcut. */
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
        <p className="text-xs text-muted-foreground">
          {t('health.setup.tokenOnce', { name: t('sources.providers.apple_health.name') })}
        </p>
      </Card>
      <ShortcutSteps />
      <div className="grid gap-2">
        {isIos() && (
          <a href={shortcutUrl()} className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }))}>
            {t('health.setup.run')}
          </a>
        )}
        <Button variant="outline" size="touch" onClick={onDone}>
          {t('health.setup.done')}
        </Button>
      </div>
    </div>
  )
}
