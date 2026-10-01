import { Link } from '@tanstack/react-router'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { errorKey } from '@/features/auth/errors'
import { FormAlert } from '@/features/auth/form-parts'
import { formatWeight, type Unit } from '@/features/training/weight'

import { useAddMeasurement } from './api'
import { Figures } from './figures'
import { connectScale, ScaleConnectionError } from './scale'
import type { Measurement } from './types'
import { IDLE, weigh, type Reading, type Weighing, type WeighingEvent } from './weighing'

type WeighSheetProps = { open: boolean; onOpenChange: (open: boolean) => void; unit: Unit }

/** "Pesar agora": connect to the scale, follow the weight as it settles, and save the reading. */
export function WeighSheet({ open, onOpenChange, unit }: WeighSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-md gap-4 rounded-t-2xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        {/* Remounted per opening: every weighing starts from nothing, and closing lets the scale go. */}
        {open && <WeighingFlow unit={unit} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  )
}

function WeighingFlow({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const save = useAddMeasurement()
  const [state, setState] = useState<Weighing>(IDLE)
  // The rules run outside render (frames arrive from the scale), so the latest state is kept here.
  const current = useRef<Weighing>(IDLE)
  const release = useRef<(() => void) | null>(null)
  const open = useRef(true)

  const letGo = () => {
    release.current?.()
    release.current = null
  }
  const store = (reading: Reading) =>
    save.mutate({
      source: 'scale',
      weight: reading.weightKg,
      ...(reading.impedance !== null && { impedance: reading.impedance }),
    })
  const send = (event: WeighingEvent) => {
    const previous = current.current
    const next = weigh(previous, event)
    if (next === previous) return
    current.current = next
    setState(next)
    if (next.phase === 'done' && previous.phase !== 'done') {
      letGo() // the reading is taken: the scale is free for its own app again
      store(next)
    }
  }

  useEffect(
    () => () => {
      open.current = false
      letGo()
    },
    [],
  )
  // A settled weight waits a few seconds for its impedance.
  const tick = useEffectEvent(() => send({ type: 'tick', at: Date.now() }))
  useEffect(() => {
    if (state.phase !== 'settled') return
    const timer = window.setInterval(tick, 500)
    return () => window.clearInterval(timer)
  }, [state.phase])

  // Called from a tap: the browser only opens its device chooser on a user gesture.
  const connect = async () => {
    save.reset()
    send({ type: 'connect' })
    try {
      const disconnect = await connectScale({
        onFrame: (frame) => send({ type: 'frame', frame, at: Date.now() }),
        onDisconnect: () => send({ type: 'failed', reason: 'failed' }),
      })
      if (!open.current) return disconnect() // closed while the chooser was open
      release.current = disconnect
      send({ type: 'connected' })
    } catch (error) {
      send({ type: 'failed', reason: error instanceof ScaleConnectionError ? error.reason : 'failed' })
    }
  }
  const weight = (kg: number) => (
    <output className="block text-center text-5xl font-medium tabular-nums">
      {formatWeight(kg, unit, i18n.language)}
    </output>
  )

  return (
    <>
      <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
      <SheetTitle className="text-lg">{t('body.scale.title')}</SheetTitle>

      {state.phase === 'idle' && (
        <>
          <p className="text-sm text-muted-foreground">{t('body.scale.intro')}</p>
          <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t('body.scale.tipApp')}</li>
            <li>{t('body.scale.tipFeet')}</li>
          </ul>
          <Button size="hero" onClick={() => void connect()}>
            {t('body.scale.connect')}
          </Button>
        </>
      )}

      {state.phase === 'connecting' && <Status busy>{t('body.scale.connecting')}</Status>}
      {state.phase === 'waiting' && <Status busy>{t('body.scale.waiting')}</Status>}
      {state.phase === 'measuring' && (
        <>
          {weight(state.weightKg)}
          <Status>{t('body.scale.measuring')}</Status>
        </>
      )}
      {state.phase === 'settled' && (
        <>
          {weight(state.weightKg)}
          <Status busy>{t('body.scale.settled')}</Status>
        </>
      )}

      {state.phase === 'error' && (
        <>
          <FormAlert messageKey={`body.scale.errors.${state.reason}`} />
          <Button variant="outline-primary" size="touch" onClick={() => void connect()}>
            {t('body.scale.retry')}
          </Button>
        </>
      )}

      {state.phase === 'done' && (
        <>
          {weight(state.weightKg)}
          {save.isPending && <Status busy>{t('body.scale.saving')}</Status>}
          {save.isError && (
            <>
              <FormAlert messageKey={errorKey(save.error)} />
              <Button variant="outline-primary" size="touch" onClick={() => store(state)}>
                {t('body.scale.retry')}
              </Button>
            </>
          )}
          {save.data && <Saved measurement={save.data} measuredImpedance={state.impedance !== null} unit={unit} />}
        </>
      )}

      <Button variant="outline" size="touch" onClick={onClose}>
        {state.phase === 'done' && save.data ? t('body.scale.done') : t('body.scale.close')}
      </Button>
    </>
  )
}

function Status({ busy, children }: { busy?: boolean; children: string }) {
  return (
    <p role="status" className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
      {busy && <Spinner />}
      {children}
    </p>
  )
}

type SavedProps = { measurement: Measurement; measuredImpedance: boolean; unit: Unit }

/** What the reading gave: its composition, or why there is only the weight. */
function Saved({ measurement, measuredImpedance, unit }: SavedProps) {
  const { t } = useTranslation()
  return (
    <>
      <Status>{t('body.scale.saved')}</Status>
      <Figures measurement={measurement} unit={unit} />
      {!measuredImpedance ? (
        <p className="text-[13px] text-muted-foreground">{t('body.scale.noImpedance')}</p>
      ) : measurement.body_fat_pct === null ? (
        <p className="text-[13px] text-muted-foreground">
          {t('body.profileNeeded')}{' '}
          <Link to="/settings/profile" className="text-primary underline-offset-4 hover:underline">
            {t('body.profileLink')}
          </Link>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t('body.estimate')}</p>
      )}
    </>
  )
}
