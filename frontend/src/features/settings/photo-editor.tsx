import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { FormAlert } from '@/features/auth/form-parts'

import { paint, toJpeg, turnPicture, type Picture } from './avatar'
import { cropRect, initialCrop, MAX_ZOOM, panBy, turn, zoomTo, type Anchor, type Crop } from './avatar-crop'

/** One press of a zoom button, an arrow key or a notch of the wheel. */
const ZOOM_STEP = 0.25
const WHEEL_STEP = 1.1
const NUDGE = 0.05

type Edit = { picture: Picture; crop: Crop }
type Point = { x: number; y: number }

type PhotoEditorProps = {
  /** The chosen picture, already readable; null keeps the dialog closed. */
  picture: Picture | null
  saving: boolean
  /** Why the last save failed (a translation key), shown inside the dialog. */
  errorKey?: string
  onCancel: () => void
  onSave: (photo: Blob) => void
}

/** Ajustar foto: place, zoom and turn the picture before it becomes the profile photo. */
export function PhotoEditor({ picture, saving, errorKey, onCancel, onSave }: PhotoEditorProps) {
  return (
    <Dialog open={picture !== null} onOpenChange={(open) => !open && !saving && onCancel()}>
      <DialogContent showCloseButton={false}>
        {/* A new picture starts from its own centre: the key drops the previous one's edits. */}
        {picture && (
          <Editor
            key={`${picture.width}x${picture.height}`}
            picture={picture}
            saving={saving}
            errorKey={errorKey}
            onCancel={onCancel}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Editor({ picture, saving, errorKey, onCancel, onSave }: PhotoEditorProps & { picture: Picture }) {
  const { t } = useTranslation()
  const [edit, setEdit] = useState<Edit>(() => ({ picture, crop: initialCrop(picture) }))
  const preview = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const fingers = useRef(new Map<number, Point>())

  const change = (next: (picture: Picture, crop: Crop) => Crop) =>
    setEdit((current) => ({ ...current, crop: next(current.picture, current.crop) }))
  const zoomBy = (factor: number, anchor?: Anchor) =>
    change((size, crop) => zoomTo(size, crop, crop.zoom * factor, anchor))
  const turnBy = (direction: 1 | -1) =>
    setEdit((current) => ({
      picture: turnPicture(current.picture, direction),
      crop: turn(current.picture, current.crop, direction).crop,
    }))

  // The preview is drawn by the same function, from the same window, as the photo that is saved.
  useEffect(() => {
    const canvas = preview.current
    if (!canvas) return
    const size = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1))
    paint(canvas, edit.picture, cropRect(edit.picture, edit.crop), size)
  }, [edit])

  // React listens to the wheel passively, and the dialog would scroll under the zoom.
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const box = element.getBoundingClientRect()
      const anchor = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
      setEdit((current) => ({
        ...current,
        crop: zoomTo(
          current.picture,
          current.crop,
          current.crop.zoom * (event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP),
          anchor,
        ),
      }))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const before = fingers.current.get(event.pointerId)
    if (!before) return
    const box = event.currentTarget.getBoundingClientRect()
    const now = { x: event.clientX, y: event.clientY }
    const others = [...fingers.current].filter(([id]) => id !== event.pointerId).map(([, point]) => point)
    fingers.current.set(event.pointerId, now)

    if (others.length === 0) {
      // One finger (or the mouse): the picture follows it.
      const dx = (now.x - before.x) / box.width
      const dy = (now.y - before.y) / box.height
      change((size, crop) => panBy(size, crop, dx, dy))
      return
    }
    // Two fingers: the distance between them zooms, around the point halfway, which also drags.
    const other = others[0]
    const spread = (point: Point) => Math.hypot(point.x - other.x, point.y - other.y)
    const middle = (point: Point) => ({ x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 })
    const factor = spread(before) > 0 ? spread(now) / spread(before) : 1
    const [from, to] = [middle(before), middle(now)]
    const anchor = { x: (to.x - box.left) / box.width, y: (to.y - box.top) / box.height }
    const dx = (to.x - from.x) / box.width
    const dy = (to.y - from.y) / box.height
    change((size, crop) => panBy(size, zoomTo(size, crop, crop.zoom * factor, anchor), dx, dy))
  }

  // Without a pointer: the arrows move the picture, + and - zoom.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE, 0],
      ArrowRight: [NUDGE, 0],
      ArrowUp: [0, -NUDGE],
      ArrowDown: [0, NUDGE],
    }
    const move = moves[event.key]
    if (move) change((size, crop) => panBy(size, crop, move[0], move[1]))
    else if (event.key === '+' || event.key === '=') zoomBy(1 + ZOOM_STEP)
    else if (event.key === '-') zoomBy(1 / (1 + ZOOM_STEP))
    else return
    event.preventDefault()
  }

  const save = async () => onSave(await toJpeg(edit.picture, cropRect(edit.picture, edit.crop)))

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('settings.profile.editor.title')}</DialogTitle>
        <DialogDescription>{t('settings.profile.editor.hint')}</DialogDescription>
      </DialogHeader>

      <div
        ref={frame}
        role="group"
        tabIndex={0}
        aria-label={t('settings.profile.editor.position')}
        className="relative mx-auto aspect-square w-full max-w-72 cursor-grab touch-none overflow-hidden rounded-xl bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <canvas ref={preview} aria-hidden className="size-full" />
        {/* The avatar is round: what falls outside the circle is dimmed, not hidden. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.55)] ring-1 ring-white/70" />
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-touch"
          aria-label={t('settings.profile.editor.zoomOut')}
          disabled={edit.crop.zoom <= 1}
          onClick={() => zoomBy(1 / (1 + ZOOM_STEP))}
        >
          <MagnifyingGlassMinusIcon />
        </Button>
        <Slider
          thumbLabel={t('settings.profile.editor.zoom')}
          value={[edit.crop.zoom]}
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          // The generated slider is 12 px tall with a track that fades into the dialog: a 44 px
          // strip to aim at, a thumb to hold and a track that can be seen.
          className="[&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-track]]:bg-foreground/20 [&>div]:h-11"
          onValueChange={(value) => {
            const zoom = Array.isArray(value) ? value[0] : value
            change((size, crop) => zoomTo(size, crop, zoom))
          }}
        />
        <Button
          variant="ghost"
          size="icon-touch"
          aria-label={t('settings.profile.editor.zoomIn')}
          disabled={edit.crop.zoom >= MAX_ZOOM}
          onClick={() => zoomBy(1 + ZOOM_STEP)}
        >
          <MagnifyingGlassPlusIcon />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="touch" onClick={() => turnBy(-1)}>
          <ArrowCounterClockwiseIcon />
          {t('settings.profile.editor.turnLeft')}
        </Button>
        <Button variant="outline" size="touch" onClick={() => turnBy(1)}>
          <ArrowClockwiseIcon />
          {t('settings.profile.editor.turnRight')}
        </Button>
      </div>

      {errorKey && <FormAlert messageKey={errorKey} />}

      <DialogFooter className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="touch" disabled={saving} onClick={onCancel}>
          {t('settings.profile.editor.cancel')}
        </Button>
        <Button variant="outline-primary" size="touch" disabled={saving} onClick={() => void save()}>
          {saving && <Spinner />}
          {t('settings.profile.editor.save')}
        </Button>
      </DialogFooter>
    </>
  )
}
