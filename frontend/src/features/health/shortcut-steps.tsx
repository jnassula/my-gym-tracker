import { useTranslation } from 'react-i18next'

import { SHORTCUT_NAME, viaNgrok } from './api'
import { SetupSteps } from './setup-steps'

// Action names as the Shortcuts app shows them (checked against its pt-PT strings).
const STEPS = ['name', 'heartRate', 'heartRateDates', 'energy', 'energyDates', 'post', 'firstRun', 'automation'] as const
// The JSON body's fields: dates and values of heart rate (hr) and active energy (ae).
const FIELDS = ['hr_t', 'hr_v', 'ae_t', 'ae_v'] as const

/** How to build the shortcut: five actions, no loops (see backend app/health/schemas.py). */
export function ShortcutSteps() {
  const { t } = useTranslation()
  return (
    <SetupSteps
      steps={STEPS.map((step) => ({
        key: step,
        content: (
          <>
            <p>{t(`health.setup.steps.${step}`, { name: SHORTCUT_NAME })}</p>
            {step === 'post' && (
              <>
                <ul className="grid gap-1 rounded-lg bg-card p-3 text-[13px]">
                  {FIELDS.map((field) => (
                    <li key={field} className="flex gap-2">
                      <code className="shrink-0 font-mono text-primary">{field}</code>
                      <span className="text-muted-foreground">{t(`health.setup.fields.${field}`)}</span>
                    </li>
                  ))}
                </ul>
                {viaNgrok() && <p className="text-muted-foreground">{t('health.setup.ngrok')}</p>}
              </>
            )}
          </>
        ),
      }))}
    />
  )
}
