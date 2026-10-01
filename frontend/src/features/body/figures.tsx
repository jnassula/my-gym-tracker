import { useTranslation } from 'react-i18next'

import { formatNumber, formatWeight, type Unit } from '@/features/training/weight'

import type { Measurement } from './types'

/** A weighing's body composition, for the figures it has (none for a weight typed in alone). */
export function Figures({ measurement, unit }: { measurement: Measurement; unit: Unit }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const percent = (value: number) => t('body.percent', { value: formatNumber(value, locale) })
  const m = measurement
  const figures = [
    { label: t('body.figures.bmi'), value: m.bmi === null ? null : formatNumber(m.bmi, locale) },
    { label: t('body.figures.bodyFat'), value: m.body_fat_pct === null ? null : percent(m.body_fat_pct) },
    { label: t('body.figures.muscle'), value: m.muscle_kg === null ? null : formatWeight(m.muscle_kg, unit, locale) },
    { label: t('body.figures.water'), value: m.water_pct === null ? null : percent(m.water_pct) },
    { label: t('body.figures.bone'), value: m.bone_kg === null ? null : formatWeight(m.bone_kg, unit, locale) },
    { label: t('body.figures.visceral'), value: m.visceral_fat === null ? null : String(m.visceral_fat) },
    { label: t('body.figures.bmr'), value: m.bmr_kcal === null ? null : t('body.kcal', { value: m.bmr_kcal }) },
  ].filter((figure) => figure.value !== null)
  if (figures.length === 0) return null
  return (
    <dl className="grid grid-cols-2 gap-2">
      {figures.map((figure) => (
        <div key={figure.label} className="grid gap-0.5 rounded-xl bg-background p-3">
          <dt className="text-[0.6875rem] text-muted-foreground">{figure.label}</dt>
          <dd className="text-lg font-medium tabular-nums">{figure.value}</dd>
        </div>
      ))}
    </dl>
  )
}
