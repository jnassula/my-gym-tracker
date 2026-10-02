/** What the import takes: one PDF (the trainer's plan, or photos as pages) or up to 10 photos. */
import type { ImportErrorCode } from './import-errors'

export const MAX_FILES = 10
export const MAX_FILE_BYTES = 20 * 1024 * 1024
export const ACCEPT = 'application/pdf,.pdf,image/jpeg,image/png,image/webp'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isPhoto(file: File): boolean {
  return IMAGE_TYPES.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)
}

/** The first thing wrong with a selection, or null; the server checks the bytes anyway. */
export function checkFiles(files: File[]): { code: ImportErrorCode; file: File } | null {
  const pdfs = files.filter(isPdf)
  if (pdfs.length > 0 && files.length > 1) return { code: 'too_many_files', file: pdfs[0] }
  if (files.length > MAX_FILES) return { code: 'too_many_files', file: files[0] }
  for (const file of files) {
    if (!isPdf(file) && !isPhoto(file)) return { code: 'unsupported_file_type', file }
    if (file.size > MAX_FILE_BYTES) return { code: 'file_too_large', file }
  }
  return null
}
