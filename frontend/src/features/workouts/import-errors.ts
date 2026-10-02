/** Import failures with their own explanation screen (see import.errors.* in the locales). */
export const IMPORT_ERRORS = [
  'pdf_no_structure',
  'image_unreadable',
  'too_many_files',
  'pdf_unreadable',
  'pdf_reader_unavailable',
  'file_too_large',
  'unsupported_file_type',
] as const
export type ImportErrorCode = (typeof IMPORT_ERRORS)[number]

export function isImportError(code: string): code is ImportErrorCode {
  return (IMPORT_ERRORS as readonly string[]).includes(code)
}
