/**
 * The browser's part of the profile photo: reading the chosen file, turning it, and drawing the
 * part the editor's window shows (`avatar-crop.ts` decides which part). What is sent is small
 * and has none of the camera's metadata; the server does the same again to whatever it gets
 * (`app/users/avatar.py`), so nothing here is a security measure.
 */
import type { Rect } from './avatar-crop'

/** Side of the photo that is uploaded: sharp at 3x on the largest avatar, some tens of KB. */
export const AVATAR_SIZE = 512

/**
 * The longest side kept while editing. A phone photo has 12 megapixels and more: drawing that
 * on every drag would stutter, and at the deepest zoom (4x) 2048 px still fill AVATAR_SIZE.
 */
const WORKING_SIDE = 2048

const JPEG_QUALITY = 0.85

/** The browser can't read the file as a picture (a HEIC outside Safari, a broken file). */
export class UnreadableImageError extends Error {
  constructor() {
    super('The image could not be read')
    this.name = 'UnreadableImageError'
  }
}

/** The picture being edited: upright (the camera's orientation applied) and of a workable size. */
export type Picture = HTMLCanvasElement

function blank(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d')
  if (!context) throw new UnreadableImageError()
  context.imageSmoothingQuality = 'high'
  return [canvas, context]
}

export async function loadPicture(file: Blob): Promise<Picture> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new UnreadableImageError()
  }
  try {
    if (bitmap.width === 0 || bitmap.height === 0) throw new UnreadableImageError()
    const scale = Math.min(1, WORKING_SIDE / Math.max(bitmap.width, bitmap.height))
    const [canvas, context] = blank(bitmap.width * scale, bitmap.height * scale)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    bitmap.close()
  }
}

/** A quarter turn (1 clockwise, -1 the other way), matching `turn` in avatar-crop.ts. */
export function turnPicture(picture: Picture, direction: 1 | -1): Picture {
  const [canvas, context] = blank(picture.height, picture.width)
  if (direction === 1) context.translate(canvas.width, 0)
  else context.translate(0, canvas.height)
  context.rotate((direction * Math.PI) / 2)
  context.drawImage(picture, 0, 0)
  return canvas
}

/** Draws `rect` of the picture over the whole of `target`, `size` pixels a side. */
export function paint(target: HTMLCanvasElement, picture: Picture, rect: Rect, size: number): void {
  const context = target.getContext('2d')
  if (!context || size <= 0) return
  target.width = size
  target.height = size
  // JPEG has no transparency: a see-through PNG gets a white ground instead of a black one.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, size, size)
  context.imageSmoothingQuality = 'high'
  context.drawImage(picture, rect.x, rect.y, rect.side, rect.side, 0, 0, size, size)
}

/** The photo to upload: `rect` of the picture, at most AVATAR_SIZE a side (never scaled up). */
export function toJpeg(picture: Picture, rect: Rect): Promise<Blob> {
  const size = Math.max(1, Math.min(AVATAR_SIZE, Math.round(rect.side)))
  const [canvas] = blank(size, size)
  paint(canvas, picture, rect, size)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new UnreadableImageError())), 'image/jpeg', JPEG_QUALITY)
  })
}
