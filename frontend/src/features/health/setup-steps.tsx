import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const HEADING = 'text-[0.6875rem] font-medium tracking-widest text-primary uppercase'

/** The numbered steps to set a source's bridge up. */
export function SetupSteps({ steps }: { steps: ReadonlyArray<{ key: string; content: ReactNode }> }) {
  const { t } = useTranslation()
  return (
    <section className="grid gap-3" aria-labelledby="setup-steps">
      <h2 id="setup-steps" className={HEADING}>
        {t('health.setup.stepsTitle')}
      </h2>
      <ol className="grid gap-4 text-sm">
        {steps.map((step, index) => (
          <li key={step.key} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-card text-xs text-primary tabular-nums">
              {index + 1}
            </span>
            <div className="grid min-w-0 gap-2 pt-0.5">{step.content}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}
