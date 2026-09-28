import { TimerIcon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { clock } from '@/features/workouts/format'

import { restTimer, useRestTimer } from './rest-timer'

/** Header pill: the countdown while resting, else the last rest's length. Opens the sheet. */
export function RestPill() {
  const { t } = useTranslation()
  const { rest, left, running, paused } = useRestTimer()
  const time = clock(running || paused ? left : rest.total)
  return (
    <Button
      variant="outline-primary"
      size="touch"
      className="h-11 shrink-0 gap-1.5 px-3 tabular-nums"
      aria-label={t('training.restPill', { time })}
      onClick={restTimer.show}
    >
      <TimerIcon className="size-5" />
      {time}
    </Button>
  )
}

const RADIUS = 45
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** The rest sheet: ring countdown, ±15 s, pause/resume, skip. `next` says what comes after. */
export function RestSheet({ next }: { next: string | null }) {
  const { t } = useTranslation()
  const { rest, left, paused } = useRestTimer()
  const over = left === 0
  const fraction = rest.total > 0 ? Math.min(1, left / rest.total) : 0
  return (
    <Sheet open={rest.open} onOpenChange={(open) => !open && restTimer.hide()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-md gap-4 rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
        <SheetTitle className="text-center text-xs tracking-widest text-muted-foreground uppercase">
          {t('training.rest.title')}
        </SheetTitle>
        <div className="relative mx-auto size-45">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="6" className="stroke-muted" />
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
              className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-linear"
            />
          </svg>
          <p
            role="timer"
            className={cn(
              'absolute inset-0 flex items-center justify-center text-5xl tabular-nums',
              over && 'text-primary',
            )}
          >
            {clock(left)}
          </p>
        </div>
        <SheetDescription className="min-h-5 text-center">
          {over ? t('training.rest.ready') : next}
        </SheetDescription>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="touch"
            aria-label={t('training.rest.less')}
            onClick={() => restTimer.adjust(-15)}
          >
            −15 s
          </Button>
          <Button
            variant="outline-primary"
            size="touch"
            onClick={over ? restTimer.restart : paused ? restTimer.resume : restTimer.pause}
          >
            {over ? t('training.rest.restart') : paused ? t('training.rest.resume') : t('training.rest.pause')}
          </Button>
          <Button
            variant="outline"
            size="touch"
            aria-label={t('training.rest.more')}
            onClick={() => restTimer.adjust(15)}
          >
            +15 s
          </Button>
        </div>
        <Button variant="ghost" size="touch" onClick={restTimer.skip}>
          {t('training.rest.skip')}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
