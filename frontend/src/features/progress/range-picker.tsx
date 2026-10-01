import { useTranslation } from 'react-i18next'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { RANGES, type Range } from './types'

/** 4 weeks, 3 months or a year: what a chart covers. */
export function RangePicker({ range, onChange }: { range: Range; onChange: (range: Range) => void }) {
  const { t } = useTranslation()
  return (
    <ToggleGroup
      value={[range]}
      // Pressing the selected range again would clear it: keep one selected.
      onValueChange={(value) => value[0] && onChange(value[0] as Range)}
      aria-label={t('progress.rangeLabel')}
      spacing={0}
      className="grid w-full grid-cols-3 rounded-xl bg-card p-1"
    >
      {RANGES.map((item) => (
        <ToggleGroupItem
          key={item}
          value={item}
          className="h-10 rounded-lg text-[13px] text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground"
        >
          {t(`progress.range.${item}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
