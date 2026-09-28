import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { passwordStrength } from './password-strength'

const SEGMENTS = [1, 2, 3, 4] as const

/** Custom 4-segment meter from the design (no shadcn equivalent). */
export function PasswordStrengthMeter({ password, id }: { password: string; id?: string }) {
  const { t } = useTranslation()
  const { score, missing } = passwordStrength(password)
  if (score === 0) return null

  const label = t(`auth.strength.${score}`)
  const hint = missing
    ? t(`auth.strength.missing.${missing}`)
    : score === 3
      ? t('auth.strength.criteriaMet')
      : null

  return (
    <div id={id} className="grid gap-1.5">
      <div
        role="meter"
        aria-label={t('auth.strength.label')}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-valuetext={label}
        className="flex gap-1"
      >
        {SEGMENTS.map((segment) => (
          <span
            key={segment}
            className={cn('h-1 flex-1 rounded-full', segment <= score ? 'bg-primary' : 'bg-border')}
          />
        ))}
      </div>
      <p className={cn('text-xs', score >= 3 ? 'text-primary' : 'text-muted-foreground')}>
        {hint ? `${label} — ${hint}` : label}
      </p>
    </div>
  )
}
