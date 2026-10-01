import { useTranslation } from 'react-i18next'

import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { syncUrl, viaNgrok } from './api'
import { CopyField } from './copy-field'
import { SetupSteps } from './setup-steps'

/** The bridge on Android: it reads Health Connect and posts to an address of the user's choice. */
const HC_WEBHOOK_STORE = 'https://play.google.com/store/apps/details?id=com.hcwebhook.app'
// Screen and option names as the HC Webhook app shows them (checked against its strings).
const STEPS = ['install', 'types', 'resolution', 'webhook', 'header', 'schedule', 'firstRun'] as const

/** Right after connecting Health Connect: the address and header to paste into the HC Webhook
 * app (the token is shown only now), and how to set the app up. */
export function HealthConnectSetup({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h2 className="text-lg">{t('health.hc.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('health.hc.intro')}</p>
      </div>
      <Card className="grid gap-4 p-4">
        <CopyField label={t('health.setup.address')} value={syncUrl()} />
        <CopyField label={t('health.hc.headerValue')} value={`Bearer ${token}`} />
        <p className="text-xs text-muted-foreground">
          {t('health.setup.tokenOnce', { name: t('sources.providers.health_connect.name') })}
        </p>
      </Card>
      <SetupSteps
        steps={STEPS.map((step) => ({
          key: step,
          content: (
            <>
              <p>{t(`health.hc.steps.${step}`)}</p>
              {step === 'header' && viaNgrok() && <p className="text-muted-foreground">{t('health.setup.ngrok')}</p>}
            </>
          ),
        }))}
      />
      <p className="text-xs text-muted-foreground">{t('health.hc.once')}</p>
      <div className="grid gap-2">
        <a
          href={HC_WEBHOOK_STORE}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: 'outline-primary', size: 'touch' }))}
        >
          {t('health.hc.store')}
        </a>
        <Button variant="outline" size="touch" onClick={onDone}>
          {t('health.setup.done')}
        </Button>
      </div>
    </div>
  )
}
