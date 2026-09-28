import { useTranslation } from 'react-i18next'

import { SHORTCUT_NAME } from './api'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'

// Action names as the Shortcuts app shows them (checked against its pt-PT strings).
const STEPS = ['name', 'heartRate', 'heartRateDates', 'energy', 'energyDates', 'post', 'firstRun', 'automation'] as const
// The JSON body's fields: dates and values of heart rate (hr) and active energy (ae).
const FIELDS = ['hr_t', 'hr_v', 'ae_t', 'ae_v'] as const

/** How to build the shortcut: five actions, no loops (see backend app/health/schemas.py). */
export function ShortcutSteps() {
  const { t } = useTranslation()
  // ngrok's free domains put a warning page in front of the API unless told not to.
  const viaNgrok = /\.ngrok(-free)?\.(app|dev|io)$/.test(window.location.hostname)
  return (
    <section className="grid gap-3" aria-labelledby="shortcut-steps">
      <h2 id="shortcut-steps" className={HEADING}>
        {t('health.setup.stepsTitle')}
      </h2>
      <ol className="grid gap-4 text-sm">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-card text-xs text-primary tabular-nums">
              {index + 1}
            </span>
            <div className="grid min-w-0 gap-2 pt-0.5">
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
                  {viaNgrok && <p className="text-muted-foreground">{t('health.setup.ngrok')}</p>}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
