/** The profile photo, made in the browser: a centred square, small, without the camera's metadata. */

/** Side of the square that is uploaded: sharp at 3x on the largest avatar, some tens of KB. */
export const AVATAR_SIZE = 512

/** The browser can't read the file as a picture (a HEIC outside Safari, a broken file). */
export class UnreadableImageError extends Error {
  constructor() {
    super('The image could not be read')
    this.name = 'UnreadableImageError'
  }
}

/** The centred square of a picture: what a round avatar shows of it. */
export function centredSquare(width: number, height: number): { x: number; y: number; side: number } {
  const side = Math.min(width, height)
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side }
}

/**
 * Crops to the centred square, scales down to AVATAR_SIZE (never up) and re-encodes as JPEG.
 * Drawing it again drops the EXIF data (the place a phone photo was taken) and turns the
 * picture the way it was shot.
 */
export async function toAvatar(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new UnreadableImageError()
  }
  try {
    const { x, y, side } = centredSquare(bitmap.width, bitmap.height)
    const size = Math.min(AVATAR_SIZE, side)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context || size === 0) throw new UnreadableImageError()
    // JPEG has no transparency: a see-through PNG gets a white ground instead of a black one.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, size, size)
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, x, y, side, side, 0, 0, size, size)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new UnreadableImageError())), 'image/jpeg', 0.85)
    })
  } finally {
    bitmap.close()
  }
}
