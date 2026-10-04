import { PlayCircleIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'

import { demoGifQuery, demoQuery, type Demo } from './api'

type DemoButtonProps = { exerciseId: string; name: string; className?: string }

/**
 * "Como fazer": opens the animation of an exercise. Renders nothing while the exercise has
 * none, so it can sit anywhere. The animation itself is only fetched once asked for.
 */
export function DemoButton({ exerciseId, name, className }: DemoButtonProps) {
  const { t } = useTranslation()
  const demo = useQuery(demoQuery(exerciseId))
  const [open, setOpen] = useState(false)

  if (!demo.data) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // A chip among chips, with a touch target taller than it looks.
        className={cn(
          'relative flex items-center gap-1.5 rounded-lg border border-primary/50 px-2.5 py-1.5 text-xs text-primary outline-none before:absolute before:-inset-x-1 before:-inset-y-2 focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <PlayCircleIcon aria-hidden weight="fill" className="size-4" />
        {t('demos.open')}
      </button>
      <DemoSheet demo={demo.data} name={name} open={open} onOpenChange={setOpen} />
    </>
  )
}

type DemoSheetProps = { demo: Demo; name: string; open: boolean; onOpenChange: (open: boolean) => void }

function DemoSheet({ demo, name, open, onOpenChange }: DemoSheetProps) {
  const { t } = useTranslation()
  const gif = useQuery({ ...demoGifQuery(demo.id), enabled: open })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-md gap-4 rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
        <div className="grid gap-0.5">
          <SheetTitle className="text-lg">{t('demos.title')}</SheetTitle>
          <SheetDescription>{name}</SheetDescription>
        </div>

        {/* The animations are drawn on white, whatever the theme. */}
        <div className="mx-auto grid aspect-square w-full max-w-64 place-items-center overflow-hidden rounded-2xl bg-white">
          {gif.isError ? (
            <FormAlert messageKey={errorKey(gif.error)} />
          ) : gif.data ? (
            <img src={gif.data} alt={t('demos.alt', { name })} className="size-full object-contain" />
          ) : (
            <Spinner className="size-6 text-neutral-500" />
          )}
        </div>

        <div className="grid gap-1 text-center text-xs text-muted-foreground">
          <p>{t('demos.shows', { name: demo.name })}</p>
          <p>{t('demos.automatic')}</p>
          <p>{t('demos.credit')}</p>
        </div>
        <Button variant="outline" size="touch" onClick={() => onOpenChange(false)}>
          {t('demos.close')}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
