/**
 * Where the profile photo is cut out of a picture (pure). The editor shows a square window on
 * the picture; these rules say what dragging, zooming and turning do to that window, and both
 * the preview and the saved photo are drawn from the same result.
 */

export type Size = { width: number; height: number }

/** The window: its centre, in picture pixels, and how far it is zoomed in (1 = as wide as fits). */
export type Crop = { x: number; y: number; zoom: number }

/** The window as the part of the picture to draw: top-left corner and side, in picture pixels. */
export type Rect = { x: number; y: number; side: number }

/** A position inside the window, as fractions of its side: (0.5, 0.5) is the middle. */
export type Anchor = { x: number; y: number }

/** Deepest zoom: a quarter of the picture's short side fills the photo. */
export const MAX_ZOOM = 4

const CENTRE: Anchor = { x: 0.5, y: 0.5 }

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** The side of the window, in picture pixels. */
export function cropSide(picture: Size, zoom: number): number {
  return Math.min(picture.width, picture.height) / zoom
}

/** The same window, zoomed within its limits and pushed back inside the picture. */
export function clampCrop(picture: Size, crop: Crop): Crop {
  const zoom = clamp(crop.zoom, 1, MAX_ZOOM)
  const half = cropSide(picture, zoom) / 2
  return {
    zoom,
    x: clamp(crop.x, half, picture.width - half),
    y: clamp(crop.y, half, picture.height - half),
  }
}

/** Where every picture starts: the centred square, as large as fits. */
export function initialCrop(picture: Size): Crop {
  return { x: picture.width / 2, y: picture.height / 2, zoom: 1 }
}

export function cropRect(picture: Size, crop: Crop): Rect {
  const side = cropSide(picture, crop.zoom)
  return { x: crop.x - side / 2, y: crop.y - side / 2, side }
}

/**
 * A drag, in fractions of the window's side. The picture follows the finger, so the window
 * moves the other way over it.
 */
export function panBy(picture: Size, crop: Crop, dx: number, dy: number): Crop {
  const side = cropSide(picture, crop.zoom)
  return clampCrop(picture, { ...crop, x: crop.x - dx * side, y: crop.y - dy * side })
}

/** Zooms to `zoom`, keeping the point of the picture under `anchor` where it is. */
export function zoomTo(picture: Size, crop: Crop, zoom: number, anchor: Anchor = CENTRE): Crop {
  const before = cropSide(picture, crop.zoom)
  const next = clamp(zoom, 1, MAX_ZOOM)
  const after = cropSide(picture, next)
  const offset = { x: anchor.x - 0.5, y: anchor.y - 0.5 }
  return clampCrop(picture, {
    zoom: next,
    x: crop.x + offset.x * (before - after),
    y: crop.y + offset.y * (before - after),
  })
}

/**
 * A quarter turn (1 clockwise, -1 the other way): the picture's sides swap and the window stays
 * on the same part of it.
 */
export function turn(picture: Size, crop: Crop, direction: 1 | -1): { picture: Size; crop: Crop } {
  const turned = { width: picture.height, height: picture.width }
  const centre =
    direction === 1 ? { x: picture.height - crop.y, y: crop.x } : { x: crop.y, y: picture.width - crop.x }
  return { picture: turned, crop: clampCrop(turned, { ...crop, ...centre }) }
}
