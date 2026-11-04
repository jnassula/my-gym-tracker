import { DeviceMobileIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

/**
 * Shown over everything when a phone is held sideways (a landscape viewport too short to be a
 * tablet): the app is laid out for portrait only, and the iPhone can't be asked to lock it.
 * The timer and the rest go on underneath.
 */
export function RotateOverlay() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      className="fixed inset-0 z-50 hidden flex-col items-center justify-center gap-3 bg-background px-8 text-center [@media(orientation:landscape)_and_(max-height:500px)]:flex"
    >
      <DeviceMobileIcon aria-hidden className="size-12 rotate-90 text-primary" />
      <p className="text-lg font-medium">{t('pwa.rotate')}</p>
      <p className="text-sm text-muted-foreground">{t('pwa.rotateHint')}</p>
    </div>
  )
}
