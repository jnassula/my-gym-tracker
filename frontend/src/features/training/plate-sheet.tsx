import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { BARS, PLATES, platesPerSide } from './plates'
import { formatNumber, type Unit } from './weight'

/** Colour by plate size, heaviest first (the design's red, accent, grey). */
const PLATE_COLORS = [
  'bg-destructive',
  'bg-primary',
  'bg-chart-3',
  'bg-chart-2',
  'bg-muted-foreground',
  'bg-border',
  'bg-border',
]

type PlateSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The weight on screen, in `unit`. */
  weight: number
  unit: Unit
}

/** "Anilhas por lado": what goes on each side of the bar for the weight on screen. */
export function PlateSheet({ open, onOpenChange, weight, unit }: PlateSheetProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [bar, setBar] = useState(BARS[unit][0])
  const load = platesPerSide(weight, bar, unit)
  const heaviest = PLATES[unit][0]
  const withUnit = (value: number) => `${formatNumber(value, locale)} ${unit}`
  const color = (plate: number) => PLATE_COLORS[PLATES[unit].indexOf(plate)] ?? 'bg-border'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-md gap-4 rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
        <div className="flex items-baseline justify-between gap-3">
          <SheetTitle className="text-lg">{t('training.plates.title', { weight: withUnit(weight) })}</SheetTitle>
          <span className="text-sm text-muted-foreground">{t('training.plates.bar', { weight: withUnit(bar) })}</span>
        </div>

        {/* The bar, then one side's plates heaviest first, then the collar. */}
        <div aria-hidden className="flex h-28 items-center justify-center gap-0.5">
          <span className="h-2 w-14 rounded-l bg-muted-foreground/60" />
          {load.plates.flatMap(({ weight: plate, count }) =>
            Array.from({ length: count }, (_, index) => (
              <span
                key={`${plate}-${index}`}
                className={cn('rounded-sm', color(plate))}
                style={{ height: `${30 + 70 * (plate / heaviest)}%`, width: plate >= 10 ? 14 : 9 }}
              />
            )),
          )}
          <span className="h-2 w-10 rounded-r bg-muted-foreground/60" />
        </div>

        {load.belowBar ? (
          <p className="text-sm text-muted-foreground">{t('training.plates.belowBar')}</p>
        ) : load.plates.length === 0 && load.remainder === 0 ? (
          <p className="text-sm text-muted-foreground">{t('training.plates.onlyBar')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {load.plates.map(({ weight: plate, count }) => (
              <li key={plate} className="flex h-9 items-center gap-2 rounded-lg bg-background px-3 text-sm tabular-nums">
                <span aria-hidden className={cn('size-2.5 rounded-full', color(plate))} />
                {t('training.plates.plate', { count, weight: formatNumber(plate, locale) })}
              </li>
            ))}
          </ul>
        )}
        {load.remainder > 0 && (
          <p role="status" className="text-sm text-warning">
            {t('training.plates.remainder', { weight: withUnit(load.remainder) })}
          </p>
        )}

        <div className="grid gap-2">
          <span className="text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
            {t('training.plates.barLabel')}
          </span>
          <ToggleGroup
            value={[String(bar)]}
            onValueChange={(value) => value[0] && setBar(Number(value[0]))}
            aria-label={t('training.plates.barLabel')}
            spacing={0}
            className="grid w-full grid-cols-3 rounded-xl bg-background p-1"
          >
            {BARS[unit].map((option) => (
              <ToggleGroupItem
                key={option}
                value={String(option)}
                className="h-10 rounded-lg text-[13px] text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground"
              >
                {withUnit(option)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Button variant="outline" size="touch" onClick={() => onOpenChange(false)}>
          {t('training.plates.close')}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
